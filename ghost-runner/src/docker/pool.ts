/**
 * Optional pool of pre-started one-shot boxes (Req 6.1 to 6.9). LONG-LIVED HOSTS ONLY.
 *
 * The pool pays off in processes that run many plans (MCP server, tests). It is NOT created by
 * `runPlan` unless the host passes `pool.size` (1 to 8). Per-hook processes (Kiro Pre Tool Use
 * hook) are short-lived and leave it off (design decision 4): they would start slots they never
 * use and pay for the exit sweep.
 *
 * Lifecycle of a slot:
 *  - start: an empty slot directory is created, a hardened box is started with that directory at
 *    `/work`, a fresh anonymous `/ghost-rec` volume, and the labels `ghost-run.pool=1` and
 *    `ghost-run.pool-owner=<pid>:<process start time>`.
 *  - acquire: hands out a ready slot at most once. The Copier fills the slot directory.
 *  - release: container, volume (`rm -f -v`) and slot directory are removed; then a replacement
 *    starts in the background, after the run, so it never counts toward run timing.
 *  - no slot ready: `acquire` returns `undefined`; the caller starts a fresh box and records
 *    `box.source: "fresh"` (Req 6.9).
 *
 * Ownership: a start-up or exit sweep removes only slots whose owner process is dead or is the
 * current process (and not a slot of another live pool in this process). Slots of a live foreign
 * owner are never touched. An owner counts as alive when its pid exists and its start time equals
 * the recorded one (pid reuse). When the start time cannot be read, a live pid counts as alive.
 *
 * Exit: `close()` removes all slots of this pool and finishes within 5 s. Signal and
 * `beforeExit` handlers call it; a synchronous `exit` handler removes any container still
 * tracked (for example after `process.exit()`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ResolvedRunnerOptions } from '../config.js';
import { createBox, type Box } from './box.js';
import type { DockerClient } from './cli.js';
import { LABEL_POOL, LABEL_POOL_OWNER, LABEL_RUN_ID, POOL_BOX_MAX_LIFETIME_SEC } from './hardening.js';

/** The exit handler must finish within this time (Req 6.7). */
export const POOL_EXIT_BUDGET_MS = 5_000;
const SLOT_START_TIMEOUT_MS = 30_000;
const SWEEP_LIST_TIMEOUT_MS = 3_000;
const SWEEP_RM_TIMEOUT_MS = 4_000;
/** Placeholder limits of a slot box until `acquire` re-arms it. */
const IDLE_EXEC_LIMIT_MS = 25_000;
const UNKNOWN_START = 'unknown';

export interface ProcessInfo {
  readonly pid: number;
  /** Owner label value of this process: `<pid>:<start time>`. */
  readonly owner: string;
  /** Whether the process named by `owner` still exists with the same start time. */
  isAlive(owner: string): boolean;
}

/** Start time of `pid` as printed by `ps -o lstart=`, or undefined when it cannot be read. */
export function processStartTime(pid: number): string | undefined {
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2_000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C' },
    });
    const t = out.trim().replace(/\s+/g, ' ');
    return t === '' ? undefined : t;
  } catch {
    return undefined;
  }
}

export function currentProcessInfo(): ProcessInfo {
  const pid = process.pid;
  const owner = `${String(pid)}:${processStartTime(pid) ?? UNKNOWN_START}`;
  return { pid, owner, isAlive: ownerIsAlive };
}

function parseOwner(owner: string): { pid: number; start: string } | undefined {
  const i = owner.indexOf(':');
  if (i <= 0) return undefined;
  const pid = Number(owner.slice(0, i));
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  return { pid, start: owner.slice(i + 1) };
}

function ownerIsAlive(owner: string): boolean {
  const parsed = parseOwner(owner);
  if (parsed === undefined) return true; // cannot prove it dead: keep
  try {
    process.kill(parsed.pid, 0);
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
  if (parsed.start === UNKNOWN_START) return true;
  const now = processStartTime(parsed.pid);
  return now === undefined || now === parsed.start;
}

/** Subset of `process` the exit handlers need. */
export interface ProcessLike {
  once(event: string, listener: (...a: never[]) => void): unknown;
  off(event: string, listener: (...a: never[]) => void): unknown;
  kill(pid: number, signal?: string): unknown;
  readonly pid: number;
}

export interface PoolParams {
  readonly client: DockerClient;
  /** 1 to 8, validated by `resolveOptions`. */
  readonly size: number;
  readonly image: string;
  readonly imageEnv?: readonly string[];
  readonly limits?: ResolvedRunnerOptions['limits'];
  readonly uid: number;
  readonly gid: number;
  /** Parent of all slot directories. Default: `<tmpdir>/ghost-run-pool`. */
  readonly rootDir?: string;
  readonly processInfo?: ProcessInfo;
  /** Install `beforeExit`, `exit`, `SIGINT`, `SIGTERM` handlers. Default true. */
  readonly installExitHandlers?: boolean;
  readonly proc?: ProcessLike;
  /** Synchronous removal used by the `exit` handler. Default: `docker rm -f -v` via spawnSync. */
  readonly syncRemove?: (containerIds: readonly string[]) => void;
  readonly exitBudgetMs?: number;
  readonly makeRunId?: () => string;
  readonly now?: () => number;
}

export interface PoolSlot {
  readonly runId: string;
  readonly containerId: string;
  /** Empty directory mounted at `/work`; the Copier fills it. */
  readonly copyDir: string;
  readonly box: Box;
  /** Removes container, volume and directory, then starts a replacement in the background. Idempotent. */
  release(): Promise<void>;
}

export interface AcquireOptions {
  readonly deadlineAt: number;
  readonly execLimitMs: number;
}

export interface Pool {
  readonly size: number;
  readonly owner: string;
  /** Sweeps leftovers of dead owners and fills the pool in the background. Idempotent. */
  start(): Promise<void>;
  /** A ready slot or undefined (then use a fresh box, `box.source: "fresh"`). Never waits. */
  acquire(opts: AcquireOptions): PoolSlot | undefined;
  readyCount(): number;
  /** Resolves when no slot start or release is in flight. */
  whenIdle(): Promise<void>;
  /** Removes every slot of this pool within the exit budget. Idempotent. */
  close(): Promise<void>;
  /** Removes slots (containers and directories) of dead owners and of this process. */
  sweep(): Promise<number>;
}

interface Tracked {
  readonly runId: string;
  containerId?: string;
  readonly dir: string;
}

/** Slots of all live pools in this process, so one pool's sweep never removes another's. */
const processSlots = new Map<string, Pool>();

function ownerDirName(owner: string): string {
  return Buffer.from(owner, 'utf8').toString('base64url');
}

function ownerFromDirName(name: string): string | undefined {
  try {
    const owner = Buffer.from(name, 'base64url').toString('utf8');
    return parseOwner(owner) === undefined || ownerDirName(owner) !== name ? undefined : owner;
  } catch {
    return undefined;
  }
}

function defaultSyncRemove(ids: readonly string[]): void {
  if (ids.length === 0) return;
  spawnSync('docker', ['rm', '-f', '-v', ...ids], { timeout: POOL_EXIT_BUDGET_MS - 500, stdio: 'ignore' });
}

export function createPool(p: PoolParams): Pool {
  const info = p.processInfo ?? currentProcessInfo();
  const root = p.rootDir ?? join(tmpdir(), 'ghost-run-pool');
  const ownDirRoot = join(root, ownerDirName(info.owner));
  const makeRunId = p.makeRunId ?? ((): string => `pool-${randomUUID()}`);
  const now = p.now ?? ((): number => Date.now());
  const exitBudgetMs = p.exitBudgetMs ?? POOL_EXIT_BUDGET_MS;
  const syncRemove = p.syncRemove ?? defaultSyncRemove;
  const proc: ProcessLike = p.proc ?? (process as unknown as ProcessLike);

  const ready: PoolSlotImpl[] = [];
  const tracked = new Map<string, Tracked>();
  const inFlight = new Set<Promise<unknown>>();
  let started: Promise<void> | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;

  const track = <T>(pr: Promise<T>): Promise<T> => {
    inFlight.add(pr);
    const done = (): void => {
      inFlight.delete(pr);
    };
    pr.then(done, done);
    return pr;
  };

  class PoolSlotImpl implements PoolSlot {
    private released: Promise<void> | undefined;
    constructor(
      readonly runId: string,
      readonly containerId: string,
      readonly copyDir: string,
      readonly box: Box,
      private readonly dir: string,
    ) {}
    release(): Promise<void> {
      this.released ??= this.doRelease();
      return this.released;
    }
    private async doRelease(): Promise<void> {
      await this.box.cleanup();
      await rm(this.dir, { recursive: true, force: true }).catch(() => undefined);
      tracked.delete(this.runId);
      processSlots.delete(this.runId);
      refill(1);
    }
  }

  async function startSlot(): Promise<void> {
    const runId = makeRunId();
    const dir = join(ownDirRoot, runId);
    const t: Tracked = { runId, dir };
    tracked.set(runId, t);
    processSlots.set(runId, pool);
    const fail = async (): Promise<void> => {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      tracked.delete(runId);
      processSlots.delete(runId);
    };
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const copyDir = await realpath(dir);
      const res = await createBox(p.client, {
        runId,
        image: p.image,
        ...(p.imageEnv !== undefined ? { imageEnv: p.imageEnv } : {}),
        mounts: { copyDir },
        ...(p.limits !== undefined ? { limits: p.limits } : {}),
        uid: p.uid,
        gid: p.gid,
        poolOwner: info.owner,
        maxLifetimeSec: POOL_BOX_MAX_LIFETIME_SEC,
        execLimitMs: IDLE_EXEC_LIMIT_MS,
        deadlineAt: now() + SLOT_START_TIMEOUT_MS,
      });
      if (!res.ok) {
        await fail();
        return;
      }
      t.containerId = res.box.containerId;
      const slot = new PoolSlotImpl(runId, res.box.containerId, copyDir, res.box, dir);
      if (closed) {
        await slot.release();
        return;
      }
      ready.push(slot);
    } catch {
      await removeByRunId(runId);
      await fail();
    }
  }

  /** Best effort removal of a container left by a failed start. */
  async function removeByRunId(runId: string): Promise<void> {
    const l = await p.client.run(['ps', '-a', '-q', '--filter', `label=${LABEL_RUN_ID}=${runId}`], {
      timeoutMs: SWEEP_LIST_TIMEOUT_MS,
    });
    if (l.code !== 0) return;
    for (const id of l.stdout.toString('utf8').split('\n').map((s) => s.trim()).filter((s) => s !== '')) {
      await p.client.run(['rm', '-f', '-v', id], { timeoutMs: SWEEP_RM_TIMEOUT_MS });
    }
  }

  /** Starts `count` slots in the background: `size` at start, one per release. */
  function refill(count: number): void {
    if (closed || started === undefined) return;
    for (let i = 0; i < count; i++) {
      track(startSlot());
    }
  }

  async function sweep(): Promise<number> {
    let removed = 0;
    const removable = (owner: string): boolean => owner === info.owner || !info.isAlive(owner);
    const list = await p.client.run(
      [
        'ps', '-a',
        '--filter', `label=${LABEL_POOL}=1`,
        '--format', `{{.ID}}\t{{.Label "${LABEL_POOL_OWNER}"}}\t{{.Label "${LABEL_RUN_ID}"}}`,
      ],
      { timeoutMs: SWEEP_LIST_TIMEOUT_MS },
    );
    if (list.code === 0) {
      const lines = list.stdout.toString('utf8').split('\n').filter((l) => l.trim() !== '');
      const ids: string[] = [];
      for (const line of lines) {
        const [id, owner, runId] = line.split('\t');
        if (id === undefined || owner === undefined || owner === '' || runId === undefined) continue;
        // Own slots that a live pool of this process still tracks stay (except our own on close).
        if (owner === info.owner && processSlots.has(runId) && processSlots.get(runId) !== pool) continue;
        if (!removable(owner)) continue;
        ids.push(id);
      }
      await Promise.all(
        ids.map(async (id) => {
          const r = await p.client.run(['rm', '-f', '-v', id], { timeoutMs: SWEEP_RM_TIMEOUT_MS });
          if (r.code === 0) removed += 1;
        }),
      );
    }
    // Slot directories of dead owners and of this process.
    let owners: string[] = [];
    try {
      owners = await readdir(root);
    } catch {
      owners = [];
    }
    for (const name of owners) {
      const owner = ownerFromDirName(name);
      if (owner === undefined) continue;
      if (owner === info.owner) {
        let slots: string[] = [];
        try {
          slots = await readdir(join(root, name));
        } catch {
          slots = [];
        }
        for (const s of slots) {
          const o = processSlots.get(s);
          if (o !== undefined && o !== pool) continue;
          if (o === pool && !closed) continue;
          await rm(join(root, name, s), { recursive: true, force: true }).catch(() => undefined);
        }
      } else if (!info.isAlive(owner)) {
        await rm(join(root, name), { recursive: true, force: true }).catch(() => undefined);
      }
    }
    return removed;
  }

  const exitHandlers: Array<[string, (...a: never[]) => void]> = [];

  function install(): void {
    const onBeforeExit = (): void => {
      void pool.close();
    };
    const onExit = (): void => {
      const ids = [...tracked.values()].flatMap((t) => (t.containerId === undefined ? [] : [t.containerId]));
      if (ids.length > 0) {
        try {
          syncRemove(ids);
        } catch {
          // exit path: nothing more to do
        }
      }
    };
    const onSignal = (sig: string) => (): void => {
      void pool.close().finally(() => {
        for (const [ev, fn] of exitHandlers) proc.off(ev, fn);
        proc.kill(proc.pid, sig);
      });
    };
    exitHandlers.push(['beforeExit', onBeforeExit], ['exit', onExit], ['SIGINT', onSignal('SIGINT')], ['SIGTERM', onSignal('SIGTERM')]);
    for (const [ev, fn] of exitHandlers) proc.once(ev, fn);
  }

  const pool: Pool = {
    size: p.size,
    owner: info.owner,
    start(): Promise<void> {
      started ??= (async (): Promise<void> => {
        if (p.installExitHandlers !== false) install();
        await sweep().catch(() => 0);
        refill(p.size);
      })();
      return started;
    },
    acquire(opts: AcquireOptions): PoolSlot | undefined {
      if (closed) return undefined;
      const slot = ready.shift();
      if (slot === undefined) return undefined;
      slot.box.rearm(opts.deadlineAt, opts.execLimitMs);
      return slot;
    },
    readyCount: () => ready.length,
    async whenIdle(): Promise<void> {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },
    close(): Promise<void> {
      closing ??= (async (): Promise<void> => {
        closed = true;
        for (const [ev, fn] of exitHandlers) proc.off(ev, fn);
        exitHandlers.length = 0;
        let timer: NodeJS.Timeout | undefined;
        const budget = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, exitBudgetMs);
          timer.unref();
        });
        const work = (async (): Promise<void> => {
          await Promise.allSettled([...inFlight]);
          const slots = ready.splice(0);
          await Promise.allSettled(slots.map((s) => s.release()));
          // Slots handed out but never released, and anything left under our owner label.
          await sweep().catch(() => 0);
        })();
        await Promise.race([work, budget]);
        if (timer !== undefined) clearTimeout(timer);
        for (const t of tracked.values()) processSlots.delete(t.runId);
      })();
      return closing;
    },
    sweep,
  };
  return pool;
}
