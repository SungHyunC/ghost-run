import { spawn } from 'node:child_process';
import { chmod, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { COPY_LIMIT_SEC, DEFAULT_EXCLUDE_DIRS } from '../config.js';
import { CopyAbortedError, planCopy, type CopyPlan } from './planner.js';

/** Folder-level clone helper (Req 4.7). Must honor `excludeDirs` at every depth and copy links as links. */
export type CopyStrategy = (ctx: {
  readonly original: string;
  readonly dest: string;
  readonly excludeDirs: readonly string[];
  readonly cloned: boolean;
  readonly signal: AbortSignal;
}) => Promise<void>;

export interface CopyOptions {
  readonly original: string;
  readonly excludeDirs?: readonly string[];
  readonly runId?: string;
  /** Existing empty directory to fill (pool slot). Placement is skipped. */
  readonly targetDir?: string;
  readonly copyStrategy?: CopyStrategy;
  /** Absolute copy limit in ms. Default 20 s. */
  readonly timeoutMs?: number;
  /** Test seams. */
  readonly platform?: NodeJS.Platform;
  readonly tmpDir?: string;
}

export interface CopyOk {
  readonly status: 'ok';
  readonly copyDir: string;
  /** Sentinel file beside the Copy; its ctime is `copiedAt`. */
  readonly sentinelPath: string;
  /** Nanosecond ctime of the sentinel as a decimal string. */
  readonly copiedAtNs: string;
  readonly cloned: boolean;
  readonly copyMs: number;
}

export interface CopyTimeout {
  readonly status: 'copy-timeout';
  readonly copyMs: number;
}

export type CopyOutcome = CopyOk | CopyTimeout;

export class CopyError extends Error {
  readonly code = 'copy-failed' as const;
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CopyError';
  }
}

export interface Placement {
  readonly copyDir: string;
  readonly cloned: boolean;
}

async function dev(p: string): Promise<number | undefined> {
  try {
    return (await stat(p)).dev;
  } catch {
    return undefined;
  }
}

/**
 * Placement order (Req 4.2): `<tmp>/ghost-run/<runId>` on Original's device;
 * else sibling `<Original parent>/.ghost-run-<runId>` when writable;
 * else `<tmp>/ghost-run/<runId>` with cloned=false. Creates the Copy directory.
 */
export async function placeCopy(original: string, runId: string, tmp: string): Promise<Placement> {
  const origDev = await dev(original);
  const tmpRoot = join(tmp, 'ghost-run');
  const tmpCopy = join(tmpRoot, runId);

  await mkdir(tmpRoot, { recursive: true, mode: 0o700 });
  if ((await dev(tmpRoot)) === origDev) {
    await mkdir(tmpCopy, { mode: 0o700 });
    return { copyDir: tmpCopy, cloned: true };
  }

  const sibling = join(dirname(resolve(original)), `.ghost-run-${runId}`);
  try {
    await mkdir(sibling, { mode: 0o700 });
    if ((await dev(sibling)) === origDev) return { copyDir: sibling, cloned: true };
    await rm(sibling, { recursive: true, force: true });
  } catch {
    // not writable: fall through to the temp directory
  }
  await mkdir(tmpCopy, { mode: 0o700 });
  return { copyDir: tmpCopy, cloned: false };
}

/** `cp` argv for one multi-source call. `--` guards names that start with '-'. */
export function cpArgs(platform: NodeJS.Platform, cloned: boolean, sources: readonly string[], destDir: string): string[] {
  const flags =
    platform === 'darwin' ? (cloned ? ['-cRP'] : ['-RP']) : cloned ? ['--reflink=auto', '-RP'] : ['-RP'];
  return [...flags, '--', ...sources, `${destDir}/`];
}

function runCp(args: string[], signal: AbortSignal): Promise<void> {
  return new Promise((res, rej) => {
    if (signal.aborted) return rej(new CopyAbortedError());
    const child = spawn('cp', args, { stdio: ['ignore', 'ignore', 'pipe'], signal });
    let err = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d: string) => {
      if (err.length < 4096) err += d;
    });
    child.on('error', (e) => rej(signal.aborted ? new CopyAbortedError() : new CopyError(`cp failed to start: ${e.message}`, e)));
    child.on('close', (code) => {
      if (signal.aborted) rej(new CopyAbortedError());
      else if (code === 0) res();
      else rej(new CopyError(`cp exited with ${code}: ${err.trim()}`));
    });
  });
}

const CP_CHUNK = 400; // keeps argv far below ARG_MAX

async function executePlan(
  plan: CopyPlan,
  original: string,
  dest: string,
  platform: NodeJS.Platform,
  cloned: boolean,
  signal: AbortSignal,
): Promise<void> {
  for (const d of plan.dirs) {
    const srcDir = d.rel === '' ? original : join(original, d.rel);
    const dstDir = d.rel === '' ? dest : join(dest, d.rel);
    if (d.rel !== '') await mkdir(dstDir, { mode: 0o700 });
    for (let i = 0; i < d.names.length; i += CP_CHUNK) {
      const sources = d.names.slice(i, i + CP_CHUNK).map((n) => join(srcDir, n));
      await runCp(cpArgs(platform, cloned, sources, dstDir), signal);
    }
  }
  // Restore source modes of created directories, deepest first, after all content is in place.
  for (const d of [...plan.dirs].reverse()) {
    if (d.rel !== '') await chmod(join(dest, d.rel), d.mode);
  }
}

/**
 * Writes the sentinel beside the Copy and returns its nanosecond ctime. Uses the
 * file system's own clock (the one that stamps file ctime), so there is no skew.
 * Also used to refresh the baseline before each later step.
 */
export async function readFsClockNs(sentinelPath: string): Promise<string> {
  await writeFile(sentinelPath, randomUUID());
  return (await stat(sentinelPath, { bigint: true })).ctimeNs.toString();
}

export function sentinelPathFor(copyDir: string): string {
  return `${copyDir}.sentinel`;
}

async function removeQuiet(...paths: string[]): Promise<void> {
  for (const p of paths) await rm(p, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Creates the Copy of `original` (Req 4). Never follows links out of Original
 * (`cp -P`, lstat walk). On the 20 s absolute limit the partial Copy is removed
 * and `{ status: 'copy-timeout' }` is returned. Other failures remove the
 * partial Copy and throw CopyError. When `targetDir` is given it is filled in
 * place and emptied (not removed) on failure.
 */
export async function copyOriginal(opts: CopyOptions): Promise<CopyOutcome> {
  const started = performance.now();
  const original = resolve(opts.original);
  const excludeDirs = opts.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;
  const platform = opts.platform ?? process.platform;
  const runId = opts.runId ?? randomUUID();
  const limitMs = opts.timeoutMs ?? COPY_LIMIT_SEC * 1000;

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, limitMs);

  let copyDir: string | undefined;
  let ownsDir = true;
  try {
    let cloned: boolean;
    if (opts.targetDir !== undefined) {
      copyDir = resolve(opts.targetDir);
      ownsDir = false;
      cloned = (await dev(copyDir)) === (await dev(original));
    } else {
      const p = await placeCopy(original, runId, opts.tmpDir ?? tmpdir());
      copyDir = p.copyDir;
      cloned = p.cloned;
    }

    if (opts.copyStrategy !== undefined) {
      await opts.copyStrategy({ original, dest: copyDir, excludeDirs, cloned, signal: ctrl.signal });
    } else {
      const plan = await planCopy(original, excludeDirs, ctrl.signal);
      await executePlan(plan, original, copyDir, platform, cloned, ctrl.signal);
    }
    if (ctrl.signal.aborted) throw new CopyAbortedError();

    const sentinelPath = sentinelPathFor(copyDir);
    const copiedAtNs = await readFsClockNs(sentinelPath);
    return { status: 'ok', copyDir, sentinelPath, copiedAtNs, cloned, copyMs: performance.now() - started };
  } catch (e) {
    if (copyDir !== undefined) {
      if (ownsDir) await removeQuiet(copyDir, sentinelPathFor(copyDir));
      else await emptyDir(copyDir);
    }
    if (timedOut || e instanceof CopyAbortedError) {
      return { status: 'copy-timeout', copyMs: performance.now() - started };
    }
    if (e instanceof CopyError) throw e;
    throw new CopyError(`copy failed: ${e instanceof Error ? e.message : String(e)}`, e);
  } finally {
    clearTimeout(timer);
  }
}

async function emptyDir(dir: string): Promise<void> {
  const names = await readdir(dir).catch(() => [] as string[]);
  for (const n of names) await removeQuiet(join(dir, n));
  await removeQuiet(sentinelPathFor(dir));
}
