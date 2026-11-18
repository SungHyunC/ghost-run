import type { FingerprintResult } from './types.js';

const hasOwn = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

/**
 * Compare two fingerprint results. Pure; does not mutate its inputs.
 *
 * - `changed` is true iff the top-level hashes differ.
 * - `changedPaths` lists every manifest key whose per-resource hash differs.
 *   A key present in only one manifest counts as changed. Sorted by UTF-16
 *   code unit order so the output is deterministic.
 */
export function compareFingerprints(
  before: FingerprintResult,
  after: FingerprintResult,
): { changed: boolean; changedPaths: readonly string[] } {
  const b = before.manifest;
  const a = after.manifest;
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  const changedPaths: string[] = [];
  for (const key of keys) {
    const inB = hasOwn(b, key);
    const inA = hasOwn(a, key);
    if (inB !== inA || (inB && b[key] !== a[key])) {
      changedPaths.push(key);
    }
  }
  changedPaths.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return { changed: before.hash !== after.hash, changedPaths };
}
