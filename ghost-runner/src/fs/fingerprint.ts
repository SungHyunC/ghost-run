import { constants as fsc } from 'node:fs';
import { open } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { lstat } from 'node:fs/promises';
import type { FingerprintResult } from '@ghost-run/core';
import { FingerprintReadError } from '../errors.js';
import { compareBytes, walkManifest, type ManifestEntry } from './manifest.js';

export type FingerprintMode = 'shortcut' | 'full';

export interface FingerprintOptions {
  readonly excludeDirs?: readonly string[];
  /**
   * "shortcut" (default): when `baseline` is given, a regular file whose size, mode,
   * mtime and ctime equal the baseline entry reuses the baseline hash without a read.
   * "full": every regular file is read and hashed.
   */
  readonly fingerprintMode?: FingerprintMode;
  /** Earlier fingerprint of the same root, used by the stat shortcut. */
  readonly baseline?: OriginalFingerprint;
}

export interface OriginalFingerprint {
  /** Core shape: manifest maps path -> sha-256 hex, "symlink:<target>", "dir:<octal mode>" or "other:<octal mode>". */
  readonly fingerprint: FingerprintResult;
  /** Manifest entries, sorted by byte order, regular files carry their hash. */
  readonly entries: readonly ManifestEntry[];
  /** Regular files whose first 16 bytes are the SQLite header, sorted by byte order. */
  readonly sqliteCandidates: readonly string[];
  /** Wall-clock time (ns since epoch, decimal string) when the walk started. */
  readonly startedAtNs: string;
}

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');
/** A stat match only counts when the file was last changed this long before the baseline walk. */
const RACY_WINDOW_NS = 2_000_000_000n;
const HASH_CONCURRENCY = 16;
const CHUNK = 64 * 1024;

function octal(mode: number): string {
  return (mode & 0o7777).toString(8);
}

async function hashFile(root: string, e: ManifestEntry): Promise<{ hash: string; sqlite: boolean }> {
  const abs = join(root, e.path);
  let fh;
  try {
    // O_NOFOLLOW: a link swapped in after the walk is refused. O_NONBLOCK: a FIFO swapped in cannot hang the open.
    fh = await open(abs, fsc.O_RDONLY | fsc.O_NOFOLLOW | fsc.O_NONBLOCK);
  } catch (err) {
    throw new FingerprintReadError(e.path, err);
  }
  try {
    const walked: BigIntStats = await lstat(abs, { bigint: true });
    const st = await fh.stat({ bigint: true });
    if (!st.isFile() || !walked.isFile() || st.ino !== walked.ino || st.dev !== walked.dev) {
      throw new FingerprintReadError(e.path, new Error('file identity changed during fingerprint'));
    }
    const h = createHash('sha256');
    const buf = Buffer.allocUnsafe(CHUNK);
    let total = 0;
    let head = Buffer.alloc(0);
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      const slice = buf.subarray(0, bytesRead);
      h.update(slice);
      if (total < SQLITE_HEADER.length) {
        head = Buffer.concat([head, slice.subarray(0, SQLITE_HEADER.length - total)]);
      }
      total += bytesRead;
    }
    return { hash: h.digest('hex'), sqlite: head.length === SQLITE_HEADER.length && head.equals(SQLITE_HEADER) };
  } catch (err) {
    if (err instanceof FingerprintReadError) throw err;
    throw new FingerprintReadError(e.path, err);
  } finally {
    await fh.close().catch(() => undefined);
  }
}

async function mapLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++] as T;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Fingerprints the Original directory. Read-only: it only lstat/readdir/readlink/open(O_RDONLY).
 * Throws FingerprintReadError naming the unreadable path.
 */
export async function fingerprintOriginal(root: string, opts: FingerprintOptions = {}): Promise<OriginalFingerprint> {
  const startedAtNs = (BigInt(Date.now()) * 1_000_000n).toString();
  const walked = await walkManifest(root, opts.excludeDirs === undefined ? {} : { excludeDirs: opts.excludeDirs });

  const useShortcut = opts.fingerprintMode !== 'full' && opts.baseline !== undefined;
  const prior = new Map<string, ManifestEntry>();
  const priorSqlite = new Set<string>();
  let priorStart = 0n;
  if (useShortcut && opts.baseline) {
    for (const e of opts.baseline.entries) prior.set(e.path, e);
    for (const p of opts.baseline.sqliteCandidates) priorSqlite.add(p);
    priorStart = BigInt(opts.baseline.startedAtNs);
  }

  const hashes = new Map<string, string>();
  const sqlite = new Set<string>();
  const toHash: ManifestEntry[] = [];
  for (const e of walked) {
    if (e.type !== 'file') continue;
    const p = prior.get(e.path);
    if (
      p !== undefined &&
      p.type === 'file' &&
      p.hash !== undefined &&
      p.size === e.size &&
      p.mode === e.mode &&
      p.mtimeNs === e.mtimeNs &&
      p.ctimeNs === e.ctimeNs &&
      BigInt(p.ctimeNs) < priorStart - RACY_WINDOW_NS
    ) {
      hashes.set(e.path, p.hash);
      if (priorSqlite.has(e.path)) sqlite.add(e.path);
    } else {
      toHash.push(e);
    }
  }

  await mapLimited(toHash, HASH_CONCURRENCY, async (e) => {
    const r = await hashFile(root, e);
    hashes.set(e.path, r.hash);
    if (r.sqlite) sqlite.add(e.path);
  });

  const entries: ManifestEntry[] = walked.map((e) => {
    const h = hashes.get(e.path);
    return h === undefined ? e : { ...e, hash: h };
  });

  const manifest: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const e of entries) {
    manifest[e.path] =
      e.type === 'file'
        ? (e.hash as string)
        : e.type === 'symlink'
          ? `symlink:${e.target ?? ''}`
          : e.type === 'dir'
            ? `dir:${octal(e.mode)}`
            : `other:${octal(e.mode)}`;
  }

  const top = createHash('sha256');
  for (const e of entries) {
    top.update(e.path);
    top.update('\0');
    top.update(manifest[e.path] as string);
    top.update('\n');
  }

  return {
    fingerprint: { hash: top.digest('hex'), manifest: { ...manifest } },
    entries,
    sqliteCandidates: [...sqlite].sort(compareBytes),
    startedAtNs,
  };
}
