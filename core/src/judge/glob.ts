/**
 * Glob validation and matching. Pure and dependency-free. No regular
 * expression is built from a pattern and the matcher uses no recursion: two
 * nested greedy two-pointer loops (segments, then code points), so matching
 * costs O(pattern length * path length).
 *
 * Syntax: literal characters, `*`, `?`, `[...]` classes (optionally negated by
 * a leading `!`, with ascending ranges), and `**` as a whole segment. A
 * pattern is anchored at the Copy root and carries an implicit trailing `**`,
 * so it also matches the directory it names and everything below it.
 */

import { normalizePath } from './normalize.js';
import { hasHiddenChar } from './sanitize.js';

export type GlobErrorCode =
  | 'empty-pattern'
  | 'absolute-pattern'
  | 'parent-segment'
  | 'unsupported-glob-syntax'
  | 'unterminated-class'
  | 'empty-class'
  | 'descending-range'
  | 'partial-doublestar'
  | 'invalid-character'
  | 'pattern-too-long';

export interface GlobError {
  readonly code: GlobErrorCode;
  readonly message: string;
}

export const MAX_PATTERN_LENGTH = 512;

const STAR = 0x2a;
const QUESTION = 0x3f;
const OPEN = 0x5b;
const CLOSE = 0x5d;
const BANG = 0x21;
const DASH = 0x2d;
const BRACE_OPEN = 0x7b;
const BRACE_CLOSE = 0x7d;
const BACKSLASH = 0x5c;
const SLASH = 0x2f;

type ClassItem = number | readonly [number, number];

type Tok =
  | { readonly k: 'lit'; readonly cp: number }
  | { readonly k: 'any' }
  | { readonly k: 'star' }
  | { readonly k: 'cls'; readonly neg: boolean; readonly items: readonly ClassItem[] };

type SegTok = { readonly ds: true } | { readonly ds: false; readonly toks: readonly Tok[] };

/** A compiled pattern: segment tokens, without the implicit trailing `**`. */
export interface CompiledGlob {
  readonly segs: readonly SegTok[];
  readonly caseSensitive: boolean;
}

/** A path as code point arrays per segment (case preserved). */
export type PathCodePoints = readonly (readonly number[])[];

export interface StepCounter {
  steps: number;
}

function toCodePoints(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) out.push(ch.codePointAt(0) as number);
  return out;
}

function single(s: string): number | undefined {
  const cp = s.codePointAt(0);
  if (cp === undefined) return undefined;
  return s.length === (cp > 0xffff ? 2 : 1) ? cp : undefined;
}

/** Lower case of a code point when it maps to exactly one code point, else the code point. */
export function lower1(cp: number): number {
  return single(String.fromCodePoint(cp).toLowerCase()) ?? cp;
}

/** Upper case of a code point when it maps to exactly one code point, else the code point. */
export function upper1(cp: number): number {
  return single(String.fromCodePoint(cp).toUpperCase()) ?? cp;
}

type ClassParse =
  | { readonly ok: true; readonly neg: boolean; readonly items: ClassItem[]; readonly next: number }
  | { readonly ok: false; readonly code: 'unterminated-class' | 'empty-class' | 'descending-range' };

/** Parse a class that starts at `cps[i] === '['`. */
function parseClass(cps: readonly number[], i: number): ClassParse {
  let j = i + 1;
  let neg = false;
  if (cps[j] === BANG) {
    neg = true;
    j++;
  }
  if (j >= cps.length) return { ok: false, code: 'unterminated-class' };
  if (cps[j] === CLOSE) return { ok: false, code: 'empty-class' };
  const items: ClassItem[] = [];
  let descending = false;
  while (j < cps.length) {
    const c = cps[j] as number;
    if (c === CLOSE) {
      if (descending) return { ok: false, code: 'descending-range' };
      return { ok: true, neg, items, next: j + 1 };
    }
    if (cps[j + 1] === DASH && j + 2 < cps.length && cps[j + 2] !== CLOSE) {
      const hi = cps[j + 2] as number;
      if (c > hi) descending = true;
      items.push([c, hi]);
      j += 3;
    } else {
      items.push(c);
      j++;
    }
  }
  return { ok: false, code: 'unterminated-class' };
}

function err(code: GlobErrorCode, message: string): GlobError {
  return { code, message };
}

/** Strict validation. The first failure wins, in a fixed order. */
export function validateGlob(pattern: string): GlobError | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return err('pattern-too-long', `pattern is longer than ${MAX_PATTERN_LENGTH} characters`);
  }
  if (pattern === '') return err('empty-pattern', 'pattern is empty');
  if (hasHiddenChar(pattern)) {
    return err('invalid-character', 'pattern contains a control or hidden character');
  }
  if (pattern.startsWith('/')) {
    return err('absolute-pattern', 'pattern must be relative to the Copy root');
  }
  const cps = toCodePoints(pattern);
  if (cps[0] === BANG) return err('unsupported-glob-syntax', 'negation with a leading ! is not supported');
  let inClass = false;
  for (const c of cps) {
    if (c === SLASH) {
      inClass = false;
    } else if (c === BACKSLASH) {
      return err('unsupported-glob-syntax', 'backslash escapes are not supported');
    } else if (inClass) {
      if (c === CLOSE) inClass = false;
    } else if (c === OPEN) {
      inClass = true;
    } else if (c === BRACE_OPEN || c === BRACE_CLOSE) {
      return err('unsupported-glob-syntax', 'brace expansion is not supported');
    }
  }
  const segments = pattern.split('/');
  if (segments.includes('..')) return err('parent-segment', 'pattern contains a .. segment');
  for (const seg of segments) {
    if (seg !== '**' && seg.includes('**')) {
      return err('partial-doublestar', '** must be a whole path segment');
    }
    const sc = toCodePoints(seg);
    let i = 0;
    while (i < sc.length) {
      if (sc[i] === OPEN) {
        const r = parseClass(sc, i);
        if (!r.ok) {
          const message =
            r.code === 'unterminated-class'
              ? 'character class is missing a closing ]'
              : r.code === 'empty-class'
                ? 'character class is empty'
                : 'character class range is descending';
          return err(r.code, message);
        }
        i = r.next;
      } else {
        i++;
      }
    }
  }
  return null;
}

/** Key used for sets and duplicate detection: NFC, no empty or `.` segments, `..` resolved. */
export function normalizePattern(pattern: string): string {
  return normalizePath(pattern);
}

function foldCp(cp: number): number {
  return lower1(cp);
}

function tokenizeSegment(seg: string, caseSensitive: boolean): Tok[] {
  const cps = toCodePoints(seg);
  const toks: Tok[] = [];
  let i = 0;
  while (i < cps.length) {
    const c = cps[i] as number;
    if (c === STAR) {
      if (toks[toks.length - 1]?.k !== 'star') toks.push({ k: 'star' });
      i++;
    } else if (c === QUESTION) {
      toks.push({ k: 'any' });
      i++;
    } else if (c === OPEN) {
      const r = parseClass(cps, i);
      if (r.ok) {
        toks.push({ k: 'cls', neg: r.neg, items: r.items });
        i = r.next;
      } else {
        toks.push({ k: 'lit', cp: caseSensitive ? c : foldCp(c) });
        i++;
      }
    } else {
      toks.push({ k: 'lit', cp: caseSensitive ? c : foldCp(c) });
      i++;
    }
  }
  return toks;
}

/** Lenient compilation: constructs that `validateGlob` rejects degrade to literal characters. */
export function compileGlob(pattern: string, caseSensitive: boolean): CompiledGlob {
  const normalized = normalizePattern(pattern);
  const segs: SegTok[] = [];
  if (normalized !== '') {
    for (const seg of normalized.split('/')) {
      if (seg === '**') segs.push({ ds: true });
      else segs.push({ ds: false, toks: tokenizeSegment(seg, caseSensitive) });
    }
  }
  return { segs, caseSensitive };
}

/** Split a normalized path into code point arrays per segment. */
export function pathCodePoints(segments: readonly string[]): PathCodePoints {
  return segments.map(toCodePoints);
}

function inItems(items: readonly ClassItem[], c: number): boolean {
  for (const it of items) {
    if (typeof it === 'number') {
      if (it === c) return true;
    } else if (c >= it[0] && c <= it[1]) {
      return true;
    }
  }
  return false;
}

function unitMatches(t: Tok, c: number, caseSensitive: boolean): boolean {
  switch (t.k) {
    case 'lit':
      return caseSensitive ? t.cp === c : t.cp === foldCp(c);
    case 'any':
      return true;
    case 'cls': {
      const hit = caseSensitive
        ? inItems(t.items, c)
        : inItems(t.items, c) || inItems(t.items, lower1(c)) || inItems(t.items, upper1(c));
      return t.neg ? !hit : hit;
    }
    default:
      return false;
  }
}

function matchSegment(
  toks: readonly Tok[],
  cps: readonly number[],
  caseSensitive: boolean,
  counter: StepCounter | undefined,
): boolean {
  let ti = 0;
  let ci = 0;
  let starT = -1;
  let starC = 0;
  while (ci < cps.length) {
    if (counter) counter.steps++;
    const t = toks[ti];
    if (t !== undefined && t.k === 'star') {
      starT = ti;
      starC = ci;
      ti++;
    } else if (t !== undefined && unitMatches(t, cps[ci] as number, caseSensitive)) {
      ti++;
      ci++;
    } else if (starT >= 0) {
      ti = starT + 1;
      starC++;
      ci = starC;
    } else {
      return false;
    }
  }
  while (toks[ti]?.k === 'star') ti++;
  return ti === toks.length;
}

/** Match a compiled pattern (with the implicit trailing `**`) against path segments. */
export function matchCompiled(
  g: CompiledGlob,
  path: PathCodePoints,
  counter?: StepCounter,
): boolean {
  const total = g.segs.length + 1; // the last pattern item is the implicit `**`
  const isDs = (k: number): boolean => k >= g.segs.length || (g.segs[k] as SegTok).ds;
  let pi = 0;
  let si = 0;
  let starP = -1;
  let starS = 0;
  while (si < path.length) {
    if (counter) counter.steps++;
    if (pi < total && isDs(pi)) {
      starP = pi;
      starS = si;
      pi++;
    } else if (pi < total) {
      const seg = g.segs[pi] as SegTok;
      if (!seg.ds && matchSegment(seg.toks, path[si] as readonly number[], g.caseSensitive, counter)) {
        pi++;
        si++;
        continue;
      }
      if (starP >= 0) {
        pi = starP + 1;
        starS++;
        si = starS;
      } else {
        return false;
      }
    } else if (starP >= 0) {
      pi = starP + 1;
      starS++;
      si = starS;
    } else {
      return false;
    }
  }
  while (pi < total && isDs(pi)) pi++;
  return pi === total;
}

/**
 * Internal matcher used by tests: does `pattern` match `path` (or a path below
 * the directory the pattern names)? Both are normalized first. A path that
 * escapes the root never matches. `counter.steps` is incremented per loop step.
 */
export function globMatches(
  pattern: string,
  path: string,
  opts: { readonly caseSensitive?: boolean; readonly counter?: StepCounter } = {},
): boolean {
  const g = compileGlob(pattern, opts.caseSensitive ?? true);
  const segs = normalizePath(path) === '' ? [] : normalizePath(path).split('/');
  if (segs[0] === '..') return false;
  return matchCompiled(g, pathCodePoints(segs), opts.counter);
}
