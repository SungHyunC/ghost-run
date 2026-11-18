/**
 * Compiled sets of path patterns. Compilation is lenient (decision D15): a
 * construct that `validateGlob` rejects degrades to literal characters, so a
 * hand-built ward set never throws. Literal patterns use a prefix lookup in a
 * `Set` (decision D16); the rest go through the glob matcher.
 */

import { type CompiledGlob, compileGlob, matchCompiled, pathCodePoints } from './glob.js';
import { foldPath, normalizePath, resolvePath } from './normalize.js';

export interface PathSet {
  /** Both spellings (as written, and `\` -> `/`) are tried; an escaping spelling never matches. */
  test(path: string): { readonly matched: boolean; readonly escapes: boolean };
}

function isLiteral(pattern: string): boolean {
  return !pattern.includes('*') && !pattern.includes('?') && !pattern.includes('[');
}

function foldSegment(s: string): string {
  return foldPath(s);
}

export function compilePathSet(
  patterns: readonly string[],
  opts: { caseSensitive: boolean },
): PathSet {
  const caseSensitive = opts.caseSensitive;
  const literals = new Set<string>();
  const globs: CompiledGlob[] = [];
  for (const p of patterns) {
    if (typeof p !== 'string') continue;
    if (isLiteral(p)) literals.add(caseSensitive ? normalizePath(p) : foldPath(p));
    else globs.push(compileGlob(p, caseSensitive));
  }

  function matchSegments(segments: readonly string[]): boolean {
    if (literals.has('')) return true;
    if (literals.size > 0) {
      let prefix = '';
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i] as string;
        prefix = i === 0 ? seg : `${prefix}/${seg}`;
        if (literals.has(caseSensitive ? prefix : foldSegment(prefix))) return true;
      }
    }
    if (globs.length > 0) {
      const cps = pathCodePoints(segments);
      for (const g of globs) {
        if (matchCompiled(g, cps)) return true;
      }
    }
    return false;
  }

  function spelling(path: string): { matched: boolean; escapes: boolean } {
    const r = resolvePath(path);
    if (r.escapes) return { matched: false, escapes: true };
    return { matched: matchSegments(r.segments), escapes: false };
  }

  return {
    test(path: string) {
      const a = spelling(path);
      const b = path.includes('\\') ? spelling(path.split('\\').join('/')) : a;
      return { matched: a.matched || b.matched, escapes: a.escapes || b.escapes };
    },
  };
}
