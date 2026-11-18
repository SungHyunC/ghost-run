/**
 * Box lifecycle: create, audit, exec, kill, collect the recorder output, remove.
 * (Req 5.1, 5.6, 5.7, 5.10, 7.2, 7.3, 7.4, 7.6, 7.7, 16.1, 16.2, 16.3)
 *
 * The runner never throws from `exec`, `collect`, or `cleanup`; failures come back as values so
 * the pipeline can always reach its cleanup step. Every docker call goes through the injected
 * `DockerClient` (argument arrays, no shell).
 */
import { collectRecorder, type CollectOptions, type CollectResult } from '../recorder/collect.js';
import type { ResolvedRunnerOptions } from '../config.js';
import { trackRun, untrackRun } from './reaper.js';
import { buildCountInvocation, parseCountOutput, type SqliteState } from '../fs/sqlite.js';
import { remainingMs, type DeadlineClock, type DockerClient } from './cli.js';
import {
  LABEL_RUN_ID,
  auditInspect,
  buildExecArgs,
  buildRunArgs,
  expectedMounts,
  type BoxMounts,
} from './hardening.js';

const systemClock: DeadlineClock = { now: () => Date.now() };

/** Upper bounds for the calls that are not part of the action budget. */
export const CREATE_TIMEOUT_MS = 10_000;
export const INSPECT_TIMEOUT_MS = 5_000;
export const KILL_TIMEOUT_MS = 5_000;
export const COLLECT_TIMEOUT_MS = 10_000;
/** `ghost-count` limit; the script itself times each sqlite3 call out at 10 s. */
export const COUNT_TIMEOUT_MS = 15_000;
/** The recorder read after a kill may run this long past the pipeline deadline (return stays within 60 s). */
export const COLLECT_GRACE_MS = 2_000;
/** Cleanup runs after the deadline and uses its own short timeouts (Req 16.2). */
export const CLEANUP_RM_TIMEOUT_MS = 5_000;
export const CLEANUP_LIST_TIMEOUT_MS = 3_000;

export interface BoxParams {
  readonly runId: string;
  /** Image reference for `docker run` and the audit (from `checkDockerAvailability`). */
  readonly image: string;
  /** Variables baked into the image that the audit accepts in addition to the box variables. */
  readonly imageEnv?: readonly string[];
  readonly mounts: BoxMounts;
  readonly limits?: ResolvedRunnerOptions['limits'];
  readonly uid: number;
  readonly gid: number;
  readonly poolOwner?: string;
  /** Seconds until the box stops itself (see BOX_MAX_LIFETIME_SEC). */
  readonly maxLifetimeSec?: number;
  /** Total execution limit for the whole plan (Req 7.3), in ms. */
  readonly execLimitMs: number;
  /** Absolute pipeline deadline, ms since epoch (Req 7.5). */
  readonly deadlineAt: number;
  readonly clock?: DeadlineClock;
}

export type ExecOutcome =
  | {
      readonly kind: 'exited';
      readonly exitCode: number;
      readonly stdout: Buffer;
      readonly stderr: Buffer;
      readonly durationMs: number;
    }
  | {
      /** The container was killed. `exec-limit`: Req 7.4. `pipeline-deadline`: Req 7.6. */
      readonly kind: 'timeout';
      readonly reason: 'exec-limit' | 'pipeline-deadline';
      readonly durationMs: number;
    }
  | { readonly kind: 'error'; readonly detail: string };

export interface CleanupResult {
  readonly ok: boolean;
  readonly detail?: string;
}

export type CreateBoxResult =
  | { readonly ok: true; readonly box: Box }
  | { readonly ok: false; readonly kind: 'create-failed'; readonly detail: string; readonly cleanup: CleanupResult }
  | {
      readonly ok: false;
      readonly kind: 'isolation-violation';
      readonly differences: readonly string[];
      readonly cleanup: CleanupResult;
    };

export interface Box {
  readonly runId: string;
  readonly containerId: string;
  readonly killed: boolean;
  /** Execute one action with the remaining execution budget. Kills the container on timeout. */
  exec(stepIndex: number, action: string, cwd?: string): Promise<ExecOutcome>;
  /**
   * Count rows per table of SQLite files (Copy-relative paths) with the in-box `ghost-count`.
   * Not part of the action budget. Never throws: a failed call, timeout, or killed box maps
   * every path to "unreadable".
   */
  countSqlite(relPaths: readonly string[]): Promise<SqliteState>;
  /** Read `/ghost-rec` with `docker cp`. Works after a normal end and after a kill. */
  collect(opts: Omit<CollectOptions, 'deadlineAt' | 'timeoutMs'>): Promise<CollectResult>;
  /** Remove container and volume. Idempotent; never throws. */
  cleanup(): Promise<CleanupResult>;
  /** Milliseconds of the execution budget still available. */
  execBudgetLeftMs(): number;
  /**
   * Sets the pipeline deadline and execution limit of a box that was started before its run
   * (pool slot). Only valid before the first `exec`.
   */
  rearm(deadlineAt: number, execLimitMs: number): void;
}

function text(b: Buffer): string {
  return b.toString('utf8');
}

/**
 * Removes the container (and its anonymous volume) of a run. First by reference, then by
 * the run-id label, so a container whose creation reported an error is still found.
 */
export async function removeRunContainers(
  client: DockerClient,
  runId: string,
  ref?: string,
): Promise<CleanupResult> {
  const details: string[] = [];
  if (ref !== undefined) {
    const r = await client.run(['rm', '-f', '-v', ref], { timeoutMs: CLEANUP_RM_TIMEOUT_MS });
    if (r.code === 0) return { ok: true };
    const err = text(r.stderr);
    if (r.code !== null && /no such container/i.test(err)) return { ok: true };
    details.push(`rm ${ref}: ${r.timedOut ? 'timeout' : r.spawnError ?? (err.trim() || `exit ${String(r.code)}`)}`);
  }
  const list = await client.run(['ps', '-a', '-q', '--filter', `label=${LABEL_RUN_ID}=${runId}`], {
    timeoutMs: CLEANUP_LIST_TIMEOUT_MS,
  });
  if (list.code !== 0) {
    details.push('ps by run-id label failed');
    return { ok: false, detail: details.join('; ') };
  }
  const ids = text(list.stdout).split('\n').map((s) => s.trim()).filter((s) => s !== '');
  let failed = 0;
  for (const id of ids) {
    const r = await client.run(['rm', '-f', '-v', id], { timeoutMs: CLEANUP_RM_TIMEOUT_MS });
    if (r.code !== 0 && !(r.code !== null && /no such container/i.test(text(r.stderr)))) failed += 1;
  }
  if (failed > 0) details.push(`${String(failed)} container(s) could not be removed`);
  return details.length === 0 ? { ok: true } : { ok: false, detail: details.join('; ') };
}

/**
 * Creates the box, audits it, and returns a handle. On a failed create or a failed audit the
 * container is removed before returning, and no action has run (Req 5.7).
 */
export async function createBox(client: DockerClient, p: BoxParams): Promise<CreateBoxResult> {
  const clock = p.clock ?? systemClock;
  // Registered before `docker run` so a process kill or a test timeout in any later await still
  // finds the container (reaper.ts). Unregistered only when removal is confirmed.
  trackRun(p.runId);
  const args = buildRunArgs(
    {
      image: p.image,
      ...(p.limits !== undefined ? { limits: p.limits } : {}),
      uid: p.uid,
      gid: p.gid,
      ...(p.poolOwner !== undefined ? { poolOwner: p.poolOwner } : {}),
      ...(p.maxLifetimeSec !== undefined ? { maxLifetimeSec: p.maxLifetimeSec } : {}),
    },
    p.runId,
    p.mounts,
  );
  const created = await client.run(args, { timeoutMs: CREATE_TIMEOUT_MS, deadlineAt: p.deadlineAt });
  const lines = text(created.stdout).split('\n').map((s) => s.trim()).filter((s) => s !== '');
  const containerId = lines[lines.length - 1];
  if (created.code !== 0 || containerId === undefined || !/^[A-Za-z0-9_.-]+$/.test(containerId)) {
    const why = created.timedOut
      ? 'docker run timed out'
      : created.spawnError ?? (text(created.stderr).trim() || 'docker run failed');
    const cleanup = await removeRunContainers(client, p.runId);
    if (cleanup.ok) untrackRun(p.runId);
    return { ok: false, kind: 'create-failed', detail: why.slice(0, 300), cleanup };
  }

  const inspect = await client.run(['inspect', containerId], { timeoutMs: INSPECT_TIMEOUT_MS, deadlineAt: p.deadlineAt });
  let differences: readonly string[] | undefined;
  if (inspect.code !== 0) {
    differences = [inspect.timedOut ? 'inspect timed out' : 'inspect failed'];
  } else {
    let json: unknown;
    try {
      json = JSON.parse(text(inspect.stdout));
    } catch {
      json = undefined;
    }
    if (json === undefined) {
      differences = ['inspect output is not valid JSON'];
    } else {
      const audit = auditInspect(
        {
          image: p.image,
          mounts: expectedMounts(p.mounts),
          ...(p.imageEnv !== undefined ? { imageEnv: p.imageEnv } : {}),
        },
        json,
      );
      if (!audit.ok) differences = audit.differences;
    }
  }
  if (differences !== undefined) {
    const cleanup = await removeRunContainers(client, p.runId, containerId);
    if (cleanup.ok) untrackRun(p.runId);
    return { ok: false, kind: 'isolation-violation', differences, cleanup };
  }

  return { ok: true, box: new DockerBox(client, p, containerId, clock) };
}

class DockerBox implements Box {
  killed = false;
  private execUsedMs = 0;
  private deadlineAt: number;
  private execLimitMs: number;
  private cleaned: CleanupResult | undefined;

  constructor(
    private readonly client: DockerClient,
    private readonly p: BoxParams,
    readonly containerId: string,
    private readonly clock: DeadlineClock,
  ) {
    this.deadlineAt = p.deadlineAt;
    this.execLimitMs = p.execLimitMs;
  }

  rearm(deadlineAt: number, execLimitMs: number): void {
    this.deadlineAt = deadlineAt;
    this.execLimitMs = execLimitMs;
    this.execUsedMs = 0;
  }

  get runId(): string {
    return this.p.runId;
  }

  execBudgetLeftMs(): number {
    return Math.max(0, this.execLimitMs - this.execUsedMs);
  }

  private async kill(): Promise<void> {
    this.killed = true;
    await this.client.run(['kill', this.containerId], { timeoutMs: KILL_TIMEOUT_MS });
  }

  async exec(stepIndex: number, action: string, cwd?: string): Promise<ExecOutcome> {
    if (this.killed) return { kind: 'error', detail: 'box was already killed' };
    const execLeft = this.execBudgetLeftMs();
    const pipelineLeft = remainingMs(this.deadlineAt, this.clock);
    // The pipeline deadline wins a tie: it is the harder limit (Req 7.6).
    const reason = pipelineLeft <= execLeft ? 'pipeline-deadline' : 'exec-limit';
    const budget = Math.min(execLeft, pipelineLeft);
    if (budget <= 0) {
      await this.kill();
      return { kind: 'timeout', reason, durationMs: 0 };
    }
    const started = this.clock.now();
    const res = await this.client.run(buildExecArgs(this.containerId, stepIndex, cwd, action), { timeoutMs: budget });
    const durationMs = Math.max(0, this.clock.now() - started);
    this.execUsedMs += durationMs;
    if (res.timedOut) {
      // Killing the `docker exec` client does not stop the process in the box; kill the container.
      await this.kill();
      return { kind: 'timeout', reason, durationMs };
    }
    if (res.spawnError !== undefined || res.code === null) {
      return { kind: 'error', detail: res.spawnError ?? 'docker exec ended without an exit code' };
    }
    return { kind: 'exited', exitCode: res.code, stdout: res.stdout, stderr: res.stderr, durationMs };
  }

  async countSqlite(relPaths: readonly string[]): Promise<SqliteState> {
    const argv = buildCountInvocation(relPaths);
    if (argv === undefined) return {};
    if (this.killed) return parseCountOutput('', 1, relPaths);
    const res = await this.client.run(['exec', '-w', '/work', this.containerId, ...argv], {
      timeoutMs: COUNT_TIMEOUT_MS,
      deadlineAt: this.deadlineAt + COLLECT_GRACE_MS,
    });
    const code = res.timedOut || res.spawnError !== undefined ? 1 : (res.code ?? 1);
    return parseCountOutput(text(res.stdout), code, relPaths);
  }

  collect(opts: Omit<CollectOptions, 'deadlineAt' | 'timeoutMs'>): Promise<CollectResult> {
    return collectRecorder(this.client, this.containerId, {
      ...opts,
      timeoutMs: COLLECT_TIMEOUT_MS,
      deadlineAt: this.deadlineAt + COLLECT_GRACE_MS,
    });
  }

  async cleanup(): Promise<CleanupResult> {
    if (this.cleaned?.ok === true) return this.cleaned;
    this.cleaned = await removeRunContainers(this.client, this.p.runId, this.containerId);
    if (this.cleaned.ok) untrackRun(this.p.runId);
    return this.cleaned;
  }
}
