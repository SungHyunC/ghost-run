/**
 * Path normalizer. Pure and dependency-free: no file system access, no symlink
 * resolution, no Node built-ins. Paths are reduced lexically.
 */

export interface ResolvedPath {
  readonly segments: readonly string[];
  readonly escapes: boolean;
}

/** NFC, split on `/`, lexical stack walk. A leading `..` sets `escapes`. */
export function resolvePath(p: string): ResolvedPath {
  const stack: string[] = [];
  let escapes = false;
  for (const segment of p.normalize('NFC').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      const top = stack[stack.length - 1];
      if (top !== undefined && top !== '..') {
        stack.pop();
      } else {
        stack.push('..');
        escapes = true;
      }
      continue;
    }
    stack.push(segment);
  }
  return { segments: stack, escapes };
}

/** Structural form, case preserved. The Copy root yields the empty string. */
export function normalizePath(p: string): string {
  return resolvePath(p).segments.join('/');
}

/**
 * Comparison form for case-insensitive wards. Each code point maps to its
 * lowercase only when the result is exactly one code point, so the character
 * count never changes (decision D1).
 */
export function foldPath(p: string): string {
  let out = '';
  for (const c of normalizePath(p)) {
    const lower = c.toLowerCase();
    out += [...lower].length === 1 ? lower : c;
  }
  return out.normalize('NFC');
}
