/**
 * Repo_World: the `World<RepoState, ShellAction>` of the ghost runner (Req 2) and
 * `stepInSession`, the one implementation of "run one action in a box, walk the Copy, compute
 * the next RepoState" that `runPlan` and `Repo_World.step` share (Req 14.7).
 */
import { randomUUID } from 'node:crypto';
import { lstat, realpath, rm } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  Change,
  Effect,
  FingerprintResult,
  ObservedEvent,
  Scene,
  Snapshot,
  World,
} from '@ghost-run/core';
import {
  PIPELINE_DEADLINE_SEC,
  resolveRunnerOptions,
  type ResolvedRunnerOptions,
  type RunnerOptions,
} from '../config.js';
import { copyOriginal, readFsClockNs, sentinelPathFor } from '../copy/copier.js';
import { checkDockerAvailability, type DockerAvailability } from '../docker/availability.js';
import { createBox, type Box, type ExecOutcome } from '../docker/box.js';
import { createDockerClient, type DockerClient } from '../docker/cli.js';
import type { ReadonlyMount } from '../docker/hardening.js';
import { diff as diffStates, advanceEntries } from '../fs/differ.js';
import { fingerprintOriginal, type OriginalFingerprint } from '../fs/fingerprint.js';
import { walkManifest, type ManifestEntry } from '../fs/manifest.js';
import { nextSqliteState, type SqliteState } from '../fs/sqlite.js';
import { EventBuilder } from '../recorder/events.js';
import type { Diagnostic } from '../result.js';
import { analyze } from '../static/analyzer.js';
import { renderRepoTree } from './render.js';
import type { RepoState, RepoWorld, ShellAction, StepRecord } from './types.js';

export type { Plan, RepoState, RepoWorld, ShellAction, StepOutcomeKind, StepRecord } from './types.js';

// -- sessions and stepInSession ------------------------------------------------

/**
 * One box with a Copy mounted at /work, plus the cursor `stepInSession` advances.
 * `runPlan` keeps one session for the whole plan; `Repo_World.step` opens a one-action session.
 */
export interface BoxSession {
  readonly box: Box;
  readonly copyDir: string;
  /** Sentinel beside the Copy; its ctime is the file system's own clock (refreshes the baseline). */
  readonly sentinelPath?: string;
  readonly excludeDirs: readonly string[];
  /** Patterns for secret-read recording (default patterns plus egress ward secrets). */
  readonly secretPatterns: readonly string[];
  /**
   * `true`: read the recorder after every step and put that step's events in
   * `lastStep.events` (Repo_World.step). `false`: the caller reads it once after the plan
   * (`runPlan`), and `lastStep.events` is empty.
   */
  readonly collectPerStep: boolean;
  /** Per-run eventId counter, shared by every collect call of this session (Req 8.14). */
  readonly eventBuilder: EventBuilder;
  /** Payloads captured by per-step collection. Memory only; keys are eventIds of events in `lastStep.events`. */
  readonly payloads: Map<string, Uint8Array>;
  /** Cwd of every action run so far, by step index (needed by the strace parser). */
  readonly cwds: (string | undefined)[];
  /** Optional sink: `stepInSession` adds the time spent counting SQLite files (ms). */
  readonly timings?: { sqliteMs: number };
  /** Cursor, advanced by `stepInSession`. */
  entries: readonly ManifestEntry[];
  sqlite: SqliteState;
  /** Nanosecond timestamp (decimal string): files with ctime at or after it are hash candidates. */
  baselineNs: string;
}

export interface StepInSessionResult {
  readonly state: RepoState;
  readonly success: boolean;
  /** Non-empty when `success` is false. Never contains command output. */
  readonly error?: string;
  readonly outcome: ExecOutcome;
}

function describeFailure(outcome: ExecOutcome): string | undefined {
  switch (outcome.kind) {
    case 'exited':
      return outcome.exitCode === 0 ? undefined : `action exited with code ${String(outcome.exitCode)}`;
    case 'timeout':
      return outcome.reason === 'exec-limit'
        ? 'action killed: execution limit exceeded'
        : 'action killed: pipeline deadline exceeded';
    case 'error':
      return `box error: ${outcome.detail || 'docker exec failed'}`;
  }
}

/**
 * Runs `action` as step `index` in the session's box, then walks the Copy (lstat only, hashing
 * only ctime candidates), recounts SQLite files that changed, and returns the next RepoState.
 * Advances the session cursor. A non-zero exit, a timeout, and a Docker error are reported in
 * the result, not thrown. Host-side read failures (an unreadable Copy) are thrown.
 */
export async function stepInSession(
  session: BoxSession,
  index: number,
  action: ShellAction,
): Promise<StepInSessionResult> {
  session.cwds[index] = action.cwd;
  if (session.sentinelPath !== undefined) session.baselineNs = await readFsClockNs(session.sentinelPath);

  const outcome = await session.box.exec(index, action.command, action.cwd);

  // Walk in every case: after a timeout or a Docker error the Copy may still have changed.
  const adv = await advanceEntries({
    root: session.copyDir,
    excludeDirs: session.excludeDirs,
    previous: session.entries,
    baselineNs: session.baselineNs,
    stepIndex: index,
  });
  const diagnostics: Diagnostic[] = [...adv.diagnostics];

  const before = new Map(session.entries.map((e) => [e.path, e]));
  const after = new Map(adv.entries.map((e) => [e.path, e]));
  const toCount = Object.keys(session.sqlite).filter((p) => {
    const a = after.get(p);
    const b = before.get(p);
    return a !== undefined && a.type === 'file' && (b === undefined || b.hash !== a.hash || b.size !== a.size);
  });
  const countStart = performance.now();
  const counted = toCount.length === 0 ? {} : await session.box.countSqlite(toCount);
  if (session.timings !== undefined) session.timings.sqliteMs += performance.now() - countStart;
  const existing = new Set(adv.entries.filter((e) => e.type === 'file').map((e) => e.path));
  const sqlite = nextSqliteState(session.sqlite, counted, existing);

  let events: readonly ObservedEvent[] = [];
  if (session.collectPerStep) {
    const res = await session.box.collect({
      executedSteps: index + 1,
      cwds: session.cwds,
      secretPatterns: session.secretPatterns,
      eventBuilder: session.eventBuilder,
    });
    // Earlier steps were already reported by their own call; keep only this step.
    events = res.events.filter((e) => e.stepIndex === index);
    for (const e of events) {
      const bytes = e.eventId === undefined ? undefined : res.payloads.get(e.eventId);
      if (e.eventId !== undefined && bytes !== undefined) session.payloads.set(e.eventId, bytes);
    }
    diagnostics.push(...res.diagnostics.filter((d) => d.stepIndex === undefined || d.stepIndex === index));
  }

  session.entries = adv.entries;
  session.sqlite = sqlite;

  const lastStep: StepRecord = {
    stepIndex: index,
    outcome: outcome.kind,
    exitCode: outcome.kind === 'exited' ? outcome.exitCode : null,
    events,
    diagnostics,
  };
  const state: RepoState = { rootPath: session.copyDir, entries: adv.entries, sqlite, lastStep };
  const error = describeFailure(outcome);
  return { state, success: error === undefined, ...(error !== undefined ? { error } : {}), outcome };
}

// -- shared helpers ------------------------------------------------------------

/** Secret patterns for recording: the default option plus every egress ward `secrets` entry. */
export function effectiveSecretPatterns(opts: Pick<ResolvedRunnerOptions, 'secretPatterns' | 'wardSet'>): string[] {
  const out = [...opts.secretPatterns];
  for (const w of opts.wardSet.wards) {
    if (w.kind !== 'egress') continue;
    for (const s of w.secrets) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Top-level excluded directories of Original mounted read-only (mode `readonly-mount`). */
export async function readonlyMountsFor(
  original: string,
  excludeDirs: readonly string[],
  mode: ResolvedRunnerOptions['excludedDirMode'],
): Promise<ReadonlyMount[]> {
  if (mode !== 'readonly-mount') return [];
  const out: ReadonlyMount[] = [];
  for (const name of excludeDirs) {
    const source = join(original, name);
    const st = await lstat(source).catch(() => undefined);
    if (st?.isDirectory() === true) out.push({ source, destination: `/work/${name}` });
  }
  return out;
}

/**
 * Copy entries with the content hash of the baseline entry of the same path (D3). `undefined`
 * hash stays for a file that has no baseline of equal type and size; `complete` is then false.
 */
export function inheritHashes(
  walked: readonly ManifestEntry[],
  baseline: readonly ManifestEntry[],
): { entries: ManifestEntry[]; complete: boolean } {
  const base = new Map(baseline.map((e) => [e.path, e]));
  let complete = true;
  const entries = walked.map((e) => {
    if (e.type !== 'file') return e;
    const b = base.get(e.path);
    if (b !== undefined && b.type === 'file' && b.hash !== undefined && b.size === e.size) {
      return { ...e, hash: b.hash };
    }
    complete = false;
    return e;
  });
  return { entries, complete };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// -- Repo_World ----------------------------------------------------------------

export interface RepoWorldOptions extends RunnerOptions {
  /** Docker client. Default: the `docker` CLI. Tests inject doubles. */
  readonly client?: DockerClient;
}

function assertAction(a: unknown): asserts a is ShellAction {
  const o = a as Partial<ShellAction> | null;
  if (
    typeof o !== 'object' ||
    o === null ||
    typeof o.command !== 'string' ||
    (o.cwd !== undefined && typeof o.cwd !== 'string')
  ) {
    throw new TypeError('ShellAction must be { command: string, cwd?: string }');
  }
}

export function createRepoWorld(opts: RepoWorldOptions): RepoWorld {
  const resolved = resolveRunnerOptions(opts);
  const client = opts.client ?? createDockerClient();
  const original = resolve(resolved.original);
  const excludeDirs = resolved.excludeDirs;
  const secretPatterns = effectiveSecretPatterns(resolved);
  const uid = process.getuid?.() ?? 1000;
  const gid = process.getgid?.() ?? 1000;

  const copies = new Set<string>();
  let seq = 0;
  let lastFingerprint: OriginalFingerprint | undefined;
  let availability: Promise<DockerAvailability> | undefined;

  const sweep = (): void => {
    for (const dir of copies) {
      try {
        rmSync(dir, { recursive: true, force: true });
        rmSync(sentinelPathFor(dir), { force: true });
      } catch {
        // best effort at process exit
      }
    }
    copies.clear();
  };
  let exitHookInstalled = false;
  const track = (dir: string): void => {
    copies.add(dir);
    if (!exitHookInstalled) {
      exitHookInstalled = true;
      process.once('exit', sweep);
    }
  };
  const removeCopy = async (dir: string): Promise<void> => {
    copies.delete(dir);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    await rm(sentinelPathFor(dir), { force: true }).catch(() => undefined);
  };

  const checkAvailable = (): Promise<DockerAvailability> => {
    availability ??= checkDockerAvailability(client, {
      ...(resolved.image !== undefined ? { image: resolved.image } : {}),
    }).then((a) => {
      if (!a.available) availability = undefined; // retry next time: Docker may start later
      return a;
    });
    return availability;
  };

  const snapshotOf = (state: RepoState, error?: string): Snapshot<RepoState> => ({
    id: `repo-${String(seq++)}`,
    state,
    result: error === undefined ? { success: true } : { success: false, error },
  });

  async function openBox(copyDir: string): Promise<{ box: Box } | { error: string }> {
    const avail = await checkAvailable();
    if (!avail.available) {
      return { error: `docker unavailable (${avail.reason}${avail.detail ? `: ${avail.detail}` : ''})` };
    }
    const now = Date.now();
    const created = await createBox(client, {
      runId: randomUUID(),
      image: avail.imageRef,
      imageEnv: avail.imageEnv,
      mounts: {
        copyDir: await realpath(copyDir),
        readonlyMounts: await readonlyMountsFor(original, excludeDirs, resolved.excludedDirMode),
      },
      limits: resolved.limits,
      uid,
      gid,
      execLimitMs: resolved.execLimitSec * 1000,
      deadlineAt: now + PIPELINE_DEADLINE_SEC * 1000,
    });
    if (created.ok) return { box: created.box };
    return {
      error:
        created.kind === 'isolation-violation'
          ? `box isolation audit failed: ${created.differences.join('; ')}`
          : `box could not be created: ${created.detail}`,
    };
  }

  /** Baseline row counts of the Original's SQLite files, counted in a short-lived box on the Copy. */
  async function baselineCounts(copyDir: string, rels: readonly string[]): Promise<SqliteState> {
    if (rels.length === 0) return {};
    const unreadable = (): SqliteState => Object.fromEntries(rels.map((p) => [p, 'unreadable' as const]));
    try {
      const opened = await openBox(copyDir);
      if ('error' in opened) return unreadable();
      try {
        return await opened.box.countSqlite(rels);
      } finally {
        await opened.box.cleanup();
      }
    } catch {
      return unreadable();
    }
  }

  const world = {
    metadata: { id: 'repo', deterministic: false } as const,

    async snapshot(): Promise<Snapshot<RepoState>> {
      const fp = await fingerprintOriginal(original, {
        excludeDirs,
        ...(lastFingerprint !== undefined ? { baseline: lastFingerprint } : {}),
      });
      lastFingerprint = fp;
      const copy = await copyOriginal({ original, excludeDirs, runId: randomUUID() });
      if (copy.status !== 'ok') throw new Error('copy timed out');
      track(copy.copyDir);
      try {
        const walked = await walkManifest(copy.copyDir, { excludeDirs });
        let { entries, complete } = inheritHashes(walked, fp.entries);
        if (!complete) {
          // The Original changed between fingerprint and copy: hash the Copy itself.
          entries = [...(await fingerprintOriginal(copy.copyDir, { excludeDirs, fingerprintMode: 'full' })).entries];
        }
        const have = new Set(entries.map((e) => e.path));
        const sqlite = await baselineCounts(
          copy.copyDir,
          fp.sqliteCandidates.filter((p) => have.has(p)),
        );
        return snapshotOf({ rootPath: copy.copyDir, entries, sqlite });
      } catch (e) {
        await removeCopy(copy.copyDir);
        throw e;
      }
    },

    async step(s: Snapshot<RepoState>, a: ShellAction): Promise<Snapshot<RepoState>> {
      assertAction(a);
      const stepRecord = (diagnostics: readonly Diagnostic[] = []): StepRecord => ({
        stepIndex: 0,
        outcome: 'error',
        exitCode: null,
        events: [],
        diagnostics,
      });
      const failed = (state: RepoState, error: string): Snapshot<RepoState> =>
        snapshotOf({ ...state, lastStep: stepRecord() }, error || 'step failed');

      let copyDir: string;
      try {
        const c = await copyOriginal({ original: s.state.rootPath, excludeDirs, runId: randomUUID() });
        if (c.status !== 'ok') return failed(s.state, 'copy of the snapshot timed out');
        copyDir = c.copyDir;
        track(copyDir);
        const sentinelPath = c.sentinelPath;
        let start: RepoState;
        try {
          const walked = await walkManifest(copyDir, { excludeDirs });
          start = {
            rootPath: copyDir,
            entries: inheritHashes(walked, s.state.entries).entries,
            sqlite: s.state.sqlite,
          };
        } catch (e) {
          return failed(s.state, `cannot read the copy: ${message(e)}`);
        }

        const opened = await openBox(copyDir);
        if ('error' in opened) return failed(start, opened.error);
        const { box } = opened;
        try {
          const session: BoxSession = {
            box,
            copyDir,
            sentinelPath,
            excludeDirs,
            secretPatterns,
            collectPerStep: true,
            eventBuilder: new EventBuilder(),
            payloads: new Map(),
            cwds: [],
            entries: start.entries,
            sqlite: start.sqlite,
            baselineNs: c.copiedAtNs,
          };
          const r = await stepInSession(session, 0, a);
          return snapshotOf(r.state, r.error);
        } catch (e) {
          return failed(start, `step failed: ${message(e)}`);
        } finally {
          await box.cleanup();
        }
      } catch (e) {
        return failed(s.state, `step failed: ${message(e)}`);
      }
    },

    diff(before: Snapshot<RepoState>, after: Snapshot<RepoState>): Change[] {
      return diffStates(before.state, after.state);
    },

    render(s: Snapshot<RepoState>): Scene {
      return renderRepoTree(s);
    },

    async fingerprint(): Promise<FingerprintResult> {
      const fp = await fingerprintOriginal(original, {
        excludeDirs,
        ...(lastFingerprint !== undefined ? { baseline: lastFingerprint } : {}),
      });
      lastFingerprint = fp;
      return fp.fingerprint;
    },

    effectsOutside(a: ShellAction): Effect[] {
      return analyze(a);
    },

    async dispose(): Promise<void> {
      if (exitHookInstalled) {
        process.off('exit', sweep);
        exitHookInstalled = false;
      }
      await Promise.all([...copies].map(removeCopy));
    },
  } satisfies RepoWorld;

  return world;
}

/** Compile-time check of Req 2.1: the runner's world is a core `World<RepoState, ShellAction>`. */
export function assertRepoWorldContract(repoWorld: RepoWorld): World<RepoState, ShellAction> {
  const w: World<RepoState, ShellAction> = repoWorld;
  return w;
}
