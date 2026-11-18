// Hidden-character classification, names, and ASCII rendering helpers.
// Every table is written as hex numbers. No literal hidden character appears here.

import type { HiddenCategory } from './types.js';

export const TAG_RANGE = [0xe0000, 0xe007f] as const;
export const ZERO_WIDTH = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff] as const;
export const BIDI_RANGES = [
  [0x202a, 0x202e],
  [0x2066, 0x2069],
] as const;

export const NAMES: Readonly<Record<number, string>> = {
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x2060: 'WORD JOINER',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',
};

/** The four-code-point HTML comment opener, built from numbers. */
export const HTML_COMMENT_OPENER = String.fromCodePoint(0x3c, 0x21, 0x2d, 0x2d);
/** The three-code-point HTML comment closer, built from numbers. */
export const HTML_COMMENT_CLOSER = String.fromCodePoint(0x2d, 0x2d, 0x3e);

/**
 * Classify one code point. Returns 'none' for everything that is not hidden.
 * U+034F, U+FE00 to U+FE0F, U+00AD, U+200E, and U+200F are 'none'.
 * The tag-sequence and ZWJ exceptions are applied by the scanner, not here.
 */
export function classify(c: number): HiddenCategory | 'none' {
  if (c >= TAG_RANGE[0] && c <= TAG_RANGE[1]) return 'tag';
  if (c < 0x200b) return 'none';
  for (const z of ZERO_WIDTH) {
    if (c === z) return 'zero-width';
  }
  for (const r of BIDI_RANGES) {
    if (c >= r[0] && c <= r[1]) return 'bidi';
  }
  return 'none';
}

/** "U+" plus at least four uppercase hex digits. */
export function formatCodePoint(c: number): string {
  return 'U+' + c.toString(16).toUpperCase().padStart(4, '0');
}

/** True for U+0020 to U+007E. */
export function isPrintableAscii(c: number): boolean {
  return c >= 0x20 && c <= 0x7e;
}

/** Replace every code point outside U+0020 to U+007E with <U+XXXX>. Lone surrogates included. */
export function escapeAscii(text: string): string {
  let out = '';
  for (let u = 0; u < text.length; ) {
    const c = text.codePointAt(u) as number;
    u += c > 0xffff ? 2 : 1;
    out += isPrintableAscii(c) ? String.fromCharCode(c) : '<' + formatCodePoint(c) + '>';
  }
  return out;
}

/** Decode one Tag_Character U+E0020 to U+E007E to its ASCII source, or undefined. */
export function decodeTagCodePoint(c: number): string | undefined {
  return c >= 0xe0020 && c <= 0xe007e ? String.fromCharCode(c - 0xe0000) : undefined;
}

/** Rendering of a tag run: ASCII source for U+E0020..U+E007E, <U+XXXX> for other tag code points. */
export function renderTagRun(codePoints: readonly number[]): string {
  let out = '';
  for (const c of codePoints) {
    const decoded = decodeTagCodePoint(c);
    out += decoded === undefined ? '<' + formatCodePoint(c) + '>' : decoded;
  }
  return out;
}

/** Rendering of a zero-width or bidi run: <U+XXXX NAME> per code point. */
export function renderNamedRun(codePoints: readonly number[]): string {
  let out = '';
  for (const c of codePoints) {
    const name = NAMES[c];
    out += '<' + formatCodePoint(c) + (name === undefined ? '' : ' ' + name) + '>';
  }
  return out;
}

/**
 * Rendering of the text between the comment opener and closer (or end of text).
 * Code points outside U+0020 to U+007E become <U+XXXX>; each Line_Break
 * (CRLF counts once) becomes a backslash followed by the letter n.
 */
export function renderComment(inner: string): string {
  const backslash = String.fromCharCode(0x5c);
  let out = '';
  for (let u = 0; u < inner.length; ) {
    const c = inner.codePointAt(u) as number;
    u += c > 0xffff ? 2 : 1;
    if (c === 0x0d) {
      if (inner.charCodeAt(u) === 0x0a) u += 1;
      out += backslash + 'n';
    } else if (c === 0x0a) {
      out += backslash + 'n';
    } else {
      out += isPrintableAscii(c) ? String.fromCharCode(c) : '<' + formatCodePoint(c) + '>';
    }
  }
  return out;
}
