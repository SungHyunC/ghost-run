import { compareCodePoints, compilePathSet } from '@ghost-run/core';
import type { SecretValues } from '@ghost-run/core';
import type { Entry } from '@ghost-run/playground-shell';

export const SECRET_FILES_MAX = 16;
export const SECRET_FILE_MAX = 65_536;

export interface SecretRead {
  readonly values: SecretValues;
  /** Zero-fills every copied byte array and clears the map. Idempotent. */
  release(): void;
}

/**
 * Copies the content of at most 16 files (65,536 bytes each) whose path matches a secret pattern,
 * in code point order of the path. Matching uses the same options as the egress ward (case-insensitive).
 */
export function readSecretValues(
  entries: Readonly<Record<string, Entry>>,
  patterns: readonly string[],
): SecretRead {
  const map = new Map<string, Uint8Array>();
  if (patterns.length > 0) {
    const set = compilePathSet(patterns, { caseSensitive: false });
    const paths = Object.keys(entries)
      .filter((p) => entries[p]?.kind === 'file' && set.test(p).matched)
      .sort(compareCodePoints)
      .slice(0, SECRET_FILES_MAX);
    for (const p of paths) {
      const e = entries[p];
      if (e?.kind === 'file') map.set(p, e.bytes.slice(0, SECRET_FILE_MAX));
    }
  }
  return {
    values: map,
    release() {
      for (const b of map.values()) b.fill(0);
      map.clear();
    },
  };
}
