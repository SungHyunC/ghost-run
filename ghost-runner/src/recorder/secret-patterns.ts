import type { Ward } from '@ghost-run/core';

/** Default secret-file patterns (Copy-relative globs). */
export const DEFAULT_SECRET_PATTERNS: readonly string[] = ['.env', '.env.*', '**/*.pem', '**/id_rsa*'];

/** Default patterns plus the `secrets` entries of every egress ward, de-duplicated in order. */
export function secretPatterns(wards: readonly Ward[] = []): readonly string[] {
  const out: string[] = [...DEFAULT_SECRET_PATTERNS];
  for (const ward of wards) {
    if (ward.kind !== 'egress') continue;
    for (const p of ward.secrets) if (!out.includes(p)) out.push(p);
  }
  return out;
}

function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

/** Normalize to a Copy-relative path with `/` separators. */
export function normalizeRelative(path: string): string {
  const parts: string[] = [];
  for (const seg of path.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Build a matcher for Copy-relative paths. A pattern without `/` matches the
 * file name at any depth; a pattern with `/` matches the whole relative path.
 */
export function createSecretMatcher(patterns: readonly string[]): (relativePath: string) => boolean {
  const compiled = patterns.map((p) => {
    const normalized = p.startsWith('./') ? p.slice(2) : p;
    return { re: globToRegExp(normalized), anyDepth: !normalized.includes('/') };
  });
  return (relativePath) => {
    const rel = normalizeRelative(relativePath);
    if (rel === '') return false;
    const base = rel.slice(rel.lastIndexOf('/') + 1);
    return compiled.some((c) => c.re.test(rel) || (c.anyDepth && c.re.test(base)));
  };
}
