/**
 * Diff engine. `advanceEntries` is the I/O part (walk the Copy, hash ctime candidates);
 * `diff` and `diffDiagnostics` are pure comparisons of two states.
 *
 * Emitted Change kinds: file-created, file-deleted, file-overwritten, symlink-changed,
 * sql-row-count. Mode-only changes and unreadable SQLite files are Diagnostics.
 */
import { constants as fsc } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { lstat, open, readlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Change } from '@ghost-run/core';
import { FingerprintReadError } from '../errors.js';
import type { Diagnostic } from '../result.js';
import { compareBytes, entryFromStats, walkManifest, type ManifestEntry } from './manifest.js';
import type { SqliteState } from './sqlite.js';

/** The part of RepoState the differ reads. */
export interface DiffState {
  readonly entries: readonly ManifestEntry[];
  readonly sqlite: SqliteState;
}

// -- pure diff -----------------------------------------------------------------

function sameFileContent(a: ManifestEntry, b: ManifestEntry): boolean {
  if (a.size !== b.size) return false;
  if (a.hash === undefined || b.hash === undefined) return true;
  return a.hash === b.hash;
}

function compareChanges(a: Change, b: Change): number {
  const pa = String(a['path']);
  const pb = String(b['path']);
  return (
    compareBytes(pa, pb) ||
    compareBytes(a.kind, b.kind) ||
    compareBytes(String(a['table'] ?? ''), String(b['table'] ?? ''))
  );
}

function indexByPath(entries: readonly ManifestEntry[]): Map<string, ManifestEntry> {
  return new Map(entries.map((e) => [e.path, e]));
}

/**
 * Pure comparison of two states. Sorted by path in byte order, `kind` as tie-breaker
 * (then table name for sql-row-count). Equal states give `[]`.
 */
export function diff(before: DiffState, after: DiffState): Change[] {
  const out: Change[] = [];
  const b = indexByPath(before.entries);
  const a = indexByPath(after.entries);

  for (const [path, be] of b) {
    const ae = a.get(path);
    if (ae === undefined) {
      out.push({ kind: 'file-deleted', path, entryType: be.type });
    } else if (ae.type !== be.type) {
      out.push({ kind: 'file-deleted', path, entryType: be.type });
      out.push({ kind: 'file-created', path, entryType: ae.type });
    } else if (be.type === 'file') {
      if (!sameFileContent(be, ae)) {
        out.push({ kind: 'file-overwritten', path, sizeBefore: be.size, sizeAfter: ae.size });
      }
    } else if (be.type === 'symlink') {
      if ((be.target ?? '') !== (ae.target ?? '')) {
        out.push({
          kind: 'symlink-changed',
          path,
          targetBefore: be.target ?? '',
          targetAfter: ae.target ?? '',
        });
      }
    }
  }
  for (const [path, ae] of a) {
    if (!b.has(path)) out.push({ kind: 'file-created', path, entryType: ae.type });
  }

  out.push(...sqlChanges(before.sqlite, after.sqlite, a));
  return out.sort(compareChanges);
}

function sqlChanges(
  before: SqliteState,
  after: SqliteState,
  afterEntries: ReadonlyMap<string, ManifestEntry>,
): Change[] {
  const out: Change[] = [];
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const path of paths) {
    const bc = Object.hasOwn(before, path) ? before[path] : undefined;
    const fileExists = afterEntries.has(path);
    // A file that still exists but has no record carries no information about this step.
    const ac = Object.hasOwn(after, path) ? after[path] : fileExists ? undefined : {};
    if (ac === undefined || ac === 'unreadable' || bc === 'unreadable') continue;
    const bt = bc ?? {};
    const tables = new Set([...Object.keys(bt), ...Object.keys(ac)]);
    for (const table of tables) {
      const inBefore = Object.hasOwn(bt, table);
      const inAfter = Object.hasOwn(ac, table);
      const rowsBefore = inBefore ? (bt[table] as number) : 0;
      const rowsAfter = inAfter ? (ac[table] as number) : 0;
      if (inBefore && !inAfter) {
        out.push({ kind: 'sql-row-count', path, table, rowsBefore, rowsAfter: 0, dropped: true });
      } else if (!inBefore && inAfter) {
        out.push({ kind: 'sql-row-count', path, table, rowsBefore: 0, rowsAfter });
      } else if (rowsBefore !== rowsAfter) {
        out.push({ kind: 'sql-row-count', path, table, rowsBefore, rowsAfter });
      }
    }
  }
  return out;
}

/**
 * Facts without a core Change kind, for `RepoState.lastStep.diagnostics`:
 * - `mode-changed` {path, modeBefore, modeAfter, stepIndex}: only the mode differs; no verdict effect.
 * - `sqlite-unreadable` {path, stepIndex}: a SQLite file could not be counted; verdict is at least `warn`.
 * Never passed to the Ward_Engine as Changes. Sorted by path, then name.
 */
export function diffDiagnostics(before: DiffState, after: DiffState, stepIndex: number): Diagnostic[] {
  const out: Diagnostic[] = [];
  const b = indexByPath(before.entries);
  const a = indexByPath(after.entries);

  for (const [path, ae] of a) {
    const be = b.get(path);
    if (be === undefined || be.type !== ae.type || ae.type === 'symlink') continue;
    if (be.mode === ae.mode) continue;
    if (ae.type === 'file' && !sameFileContent(be, ae)) continue;
    out.push({
      name: 'mode-changed',
      stepIndex,
      path,
      detail: { modeBefore: be.mode, modeAfter: ae.mode },
    });
  }

  for (const [path, c] of Object.entries(after.sqlite)) {
    if (c !== 'unreadable') continue;
    const wasUnreadable = Object.hasOwn(before.sqlite, path) && before.sqlite[path] === 'unreadable';
    const be = b.get(path);
    const ae = a.get(path);
    const changed = be === undefined || ae === undefined || !sameFileContent(be, ae);
    if (!wasUnreadable || changed) out.push({ name: 'sqlite-unreadable', stepIndex, path });
  }

  return out.sort((x, y) => compareBytes(x.path ?? '', y.path ?? '') || compareBytes(x.name, y.name));
}

// -- incremental walk and hashing ------------------------------------------------

export interface AdvanceOptions {
  readonly root: string;
  readonly excludeDirs?: readonly string[];
  /** Entries after the previous step (or before the first action), sorted by byte order. */
  readonly previous: readonly ManifestEntry[];
  /** Nanosecond timestamp (decimal string) of the previous baseline (`copiedAt` for the first step). */
  readonly baselineNs: string;
  readonly stepIndex: number;
  /** Wall clock in ns since the epoch; injectable for tests. */
  readonly nowNs?: () => bigint;
}

export interface AdvanceResult {
  readonly entries: ManifestEntry[];
  readonly diagnostics: Diagnostic[];
  /** Baseline for the next step: the time the walk started, so later writes are always candidates. */
  readonly nextBaselineNs: string;
}

const CHUNK = 64 * 1024;

class SwappedError extends Error {}

interface HashRound {
  readonly hash: string;
  readonly pre: BigIntStats;
  readonly stable: boolean;
}

async function hashRound(root: string, path: string): Promise<HashRound> {
  const abs = join(root, path);
  let fh;
  try {
    fh = await open(abs, fsc.O_RDONLY | fsc.O_NOFOLLOW | fsc.O_NONBLOCK);
  } catch (e) {
    throw new SwappedError(String(e));
  }
  try {
    const walked = await lstat(abs, { bigint: true }).catch(() => undefined);
    const pre = await fh.stat({ bigint: true });
    if (walked === undefined || !pre.isFile() || !walked.isFile() || pre.ino !== walked.ino || pre.dev !== walked.dev) {
      throw new SwappedError('identity changed');
    }
    const h = createHash('sha256');
    const buf = Buffer.allocUnsafe(CHUNK);
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      h.update(buf.subarray(0, bytesRead));
    }
    const post = await fh.stat({ bigint: true });
    const stable = pre.ctimeNs === post.ctimeNs && pre.mtimeNs === post.mtimeNs && pre.size === post.size;
    return { hash: h.digest('hex'), pre, stable };
  } finally {
    await fh.close().catch(() => undefined);
  }
}

/** Re-reads one path with lstat. `undefined` when it no longer exists. */
async function relstat(root: string, path: string): Promise<ManifestEntry | undefined> {
  const abs = join(root, path);
  let st: BigIntStats;
  try {
    st = await lstat(abs, { bigint: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ENOTDIR') {
      return undefined;
    }
    throw new FingerprintReadError(path, e);
  }
  let target: string | undefined;
  if (st.isSymbolicLink()) {
    try {
      target = await readlink(abs);
    } catch (e) {
      throw new FingerprintReadError(path, e);
    }
  }
  return entryFromStats(path, st, target);
}

/** Hashes one candidate: O_NOFOLLOW open, fstat identity check, one rehash when unstable. */
async function hashCandidate(
  root: string,
  entry: ManifestEntry,
  stepIndex: number,
  diagnostics: Diagnostic[],
): Promise<ManifestEntry | undefined> {
  let current = entry;
  for (let swaps = 0; ; swaps++) {
    if (current.type !== 'file') return current;
    try {
      let round = await hashRound(root, current.path);
      if (!round.stable) {
        round = await hashRound(root, current.path);
        if (!round.stable) diagnostics.push({ name: 'diff-unstable', stepIndex, path: current.path });
      }
      return { ...entryFromStats(current.path, round.pre), hash: round.hash };
    } catch (e) {
      if (!(e instanceof SwappedError)) {
        throw e instanceof FingerprintReadError ? e : new FingerprintReadError(current.path, e);
      }
      // The path changed between the walk and the open (removed, or replaced by a link).
      diagnostics.push({ name: 'baseline-race', stepIndex, path: current.path });
      const fresh = await relstat(root, current.path);
      if (fresh === undefined) return undefined;
      if (swaps >= 1 && fresh.type === 'file') throw new FingerprintReadError(current.path, e);
      current = fresh;
    }
  }
}

function isCandidate(e: ManifestEntry, prev: ManifestEntry | undefined, baseline: bigint): boolean {
  if (prev === undefined || prev.type !== 'file' || prev.hash === undefined) return true;
  return (
    BigInt(e.ctimeNs) >= baseline || e.size !== prev.size || e.mode !== prev.mode || e.mtimeNs !== prev.mtimeNs
  );
}

/**
 * Walks the Copy with lstat, hashes only ctime candidates (ctime >= baseline, or size, mode
 * or mtime differs from the previous entry, or no previous hash) and lets every other regular
 * file inherit its previous hash. Only reads the Copy.
 */
export async function advanceEntries(opts: AdvanceOptions): Promise<AdvanceResult> {
  const now = opts.nowNs ?? ((): bigint => BigInt(Date.now()) * 1_000_000n);
  const walkStart = now();
  const baseline = BigInt(opts.baselineNs);
  const diagnostics: Diagnostic[] = [];
  const prev = indexByPath(opts.previous);
  const walked = await walkManifest(opts.root, opts.excludeDirs === undefined ? {} : { excludeDirs: opts.excludeDirs });

  const resolved = new Map<string, ManifestEntry | undefined>();
  const todo: ManifestEntry[] = [];
  for (const e of walked) {
    if (e.type !== 'file') {
      resolved.set(e.path, e);
      continue;
    }
    const p = prev.get(e.path);
    if (p !== undefined && p.hash !== undefined && !isCandidate(e, p, baseline)) {
      resolved.set(e.path, { ...e, hash: p.hash });
    } else {
      todo.push(e);
    }
  }

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < todo.length) {
      const e = todo[next++] as ManifestEntry;
      resolved.set(e.path, await hashCandidate(opts.root, e, opts.stepIndex, diagnostics));
    }
  };
  await Promise.all(Array.from({ length: Math.min(16, todo.length) }, worker));

  const entries: ManifestEntry[] = [];
  for (const e of walked) {
    const r = resolved.get(e.path);
    if (r === undefined) continue;
    entries.push(r);
    // Changed after the walk began: the next step must see it, which the new baseline guarantees.
    if (r.type === 'file' && BigInt(r.ctimeNs) >= walkStart && !diagnostics.some((d) => d.path === r.path && d.name === 'baseline-race')) {
      diagnostics.push({ name: 'baseline-race', stepIndex: opts.stepIndex, path: r.path });
    }
  }
  entries.sort((x, y) => compareBytes(x.path, y.path));
  diagnostics.sort((x, y) => compareBytes(x.path ?? '', y.path ?? '') || compareBytes(x.name, y.name));
  return { entries, diagnostics, nextBaselineNs: walkStart.toString() };
}
