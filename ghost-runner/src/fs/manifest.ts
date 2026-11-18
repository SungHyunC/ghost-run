import { lstat, readdir, readlink } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { join } from 'node:path';
import { FingerprintReadError } from '../errors.js';

/** One lstat-derived record of a path below a root. Symbolic links are never followed. */
export interface ManifestEntry {
  /** Relative to the walked root, '/' separators. */
  readonly path: string;
  readonly type: 'file' | 'dir' | 'symlink' | 'other';
  readonly size: number;
  readonly mode: number;
  /** Nanoseconds since the epoch, bigint as a decimal string (JSON safe). */
  readonly mtimeNs: string;
  readonly ctimeNs: string;
  /** Symlink target, never followed. */
  readonly target?: string;
  /** sha-256 hex, regular files only. */
  readonly hash?: string;
}

export interface WalkOptions {
  /** Directory names (no '/') skipped at every depth, together with everything below them. */
  readonly excludeDirs?: readonly string[];
}

/** Compares two strings by the byte order of their UTF-8 encoding. */
export function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export function entryTypeOf(st: BigIntStats): ManifestEntry['type'] {
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isDirectory()) return 'dir';
  if (st.isFile()) return 'file';
  return 'other';
}

/** Builds an entry (without hash) from lstat data. Exported for the fingerprint's identity check. */
export function entryFromStats(path: string, st: BigIntStats, target?: string): ManifestEntry {
  const base = {
    path,
    type: entryTypeOf(st),
    size: Number(st.size),
    mode: Number(st.mode),
    mtimeNs: st.mtimeNs.toString(),
    ctimeNs: st.ctimeNs.toString(),
  };
  return target === undefined ? base : { ...base, target };
}

/**
 * Walks `root` with lstat only (never stat, never following links) and returns
 * every entry below it, sorted by path in byte order. The root itself is not listed.
 * Directories named in `excludeDirs` are skipped at every depth. Read-only.
 * Throws FingerprintReadError naming the path that could not be read.
 */
export async function walkManifest(root: string, opts: WalkOptions = {}): Promise<ManifestEntry[]> {
  const exclude = new Set(opts.excludeDirs ?? []);
  const out: ManifestEntry[] = [];

  async function visit(absDir: string, relDir: string): Promise<void> {
    let names: string[];
    try {
      names = await readdir(absDir);
    } catch (e) {
      throw new FingerprintReadError(relDir === '' ? '.' : relDir, e);
    }
    const subdirs: Array<[string, string]> = [];
    await Promise.all(
      names.map(async (name) => {
        const abs = join(absDir, name);
        const rel = relDir === '' ? name : `${relDir}/${name}`;
        let st: BigIntStats;
        try {
          st = await lstat(abs, { bigint: true });
        } catch (e) {
          throw new FingerprintReadError(rel, e);
        }
        const type = entryTypeOf(st);
        if (type === 'dir' && exclude.has(name)) return;
        let target: string | undefined;
        if (type === 'symlink') {
          try {
            target = await readlink(abs);
          } catch (e) {
            throw new FingerprintReadError(rel, e);
          }
        }
        out.push(entryFromStats(rel, st, target));
        if (type === 'dir') subdirs.push([abs, rel]);
      }),
    );
    await Promise.all(subdirs.map(([abs, rel]) => visit(abs, rel)));
  }

  await visit(root, '');
  out.sort((a, b) => compareBytes(a.path, b.path));
  return out;
}
