import { lstat, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

/**
 * One directory of the Copy that the copier must create itself (`mkdir`) because
 * it has an excluded directory among its descendants. `names` are the direct
 * entries that can be copied wholesale with one multi-source `cp` call. Marked
 * subdirectories are not in `names`; they have their own PlanDir.
 */
export interface PlanDir {
  /** Original-relative path with '/' separators; '' for the root. */
  readonly rel: string;
  /** Source directory mode (lstat), re-applied after its content is copied. */
  readonly mode: number;
  /** Entry names to copy with `cp -RP`, sorted by byte order. */
  readonly names: readonly string[];
}

/** Parents come before their children. The first element is always the root. */
export interface CopyPlan {
  readonly dirs: readonly PlanDir[];
  /** Number of excluded directories skipped (diagnostic only). */
  readonly excludedCount: number;
}

export class CopyAbortedError extends Error {
  readonly code = 'copy-aborted' as const;
  constructor() {
    super('copy aborted');
    this.name = 'CopyAbortedError';
  }
}

interface Walked {
  /** True when this directory has an excluded directory among its descendants. */
  readonly marked: boolean;
  /** PlanDirs of this subtree, parents first. Empty when not marked. */
  readonly dirs: PlanDir[];
}

function byteOrder(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

async function isRealDirectory(parentAbs: string, e: Dirent): Promise<boolean> {
  if (e.isDirectory()) return true;
  if (e.isSymbolicLink() || e.isFile()) return false;
  // d_type unknown on some file systems: lstat never follows links.
  return (await lstat(join(parentAbs, e.name))).isDirectory();
}

/**
 * Builds the exclusion-aware copy plan with one lstat/readdir walk of `original`.
 * Never follows symbolic links. A symbolic link named like an excluded directory
 * is not a directory and is copied as a link. Throws CopyAbortedError when the
 * signal fires.
 */
export async function planCopy(
  original: string,
  excludeDirs: readonly string[],
  signal?: AbortSignal,
): Promise<CopyPlan> {
  const excluded = new Set(excludeDirs);
  let excludedCount = 0;

  const walk = async (abs: string, rel: string): Promise<Walked> => {
    if (signal?.aborted === true) throw new CopyAbortedError();
    const entries = await readdir(abs, { withFileTypes: true });
    const plain: string[] = [];
    const marked: Walked[] = [];
    const markedNames = new Set<string>();
    let hasExcluded = false;

    for (const e of entries) {
      if (await isRealDirectory(abs, e)) {
        if (excluded.has(e.name)) {
          hasExcluded = true;
          excludedCount += 1;
          continue;
        }
        const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
        const child = await walk(join(abs, e.name), childRel);
        if (child.marked) {
          marked.push(child);
          markedNames.add(e.name);
        }
      }
    }
    for (const e of entries) {
      if (markedNames.has(e.name)) continue;
      // Excluded directories were skipped above; re-test to keep them out of `plain`.
      if (excluded.has(e.name) && (await isRealDirectory(abs, e))) continue;
      plain.push(e.name);
    }

    const isMarked = hasExcluded || marked.length > 0;
    if (!isMarked && rel !== '') return { marked: false, dirs: [] };

    const mode = (await lstat(abs)).mode & 0o7777;
    plain.sort(byteOrder);
    const self: PlanDir = { rel, mode, names: plain };
    const dirs: PlanDir[] = [self];
    for (const m of marked) dirs.push(...m.dirs);
    return { marked: isMarked, dirs };
  };

  const root = await walk(original, '');
  return { dirs: root.dirs, excludedCount };
}
