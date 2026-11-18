/**
 * Text sanitizer: makes hidden and control code points visible as `\u{HEX}`
 * escapes and bounds the output length. Pure and dependency-free.
 */

export const HIDDEN_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x007f],
  [0x200b, 0x200d],
  [0x2060, 0x2060],
  [0xfeff, 0xfeff],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xe0000, 0xe007f],
];

function isHiddenCodePoint(cp: number): boolean {
  for (const [lo, hi] of HIDDEN_RANGES) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/** True when `s` contains a code point in `HIDDEN_RANGES`. */
export function hasHiddenChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (isHiddenCodePoint(s.charCodeAt(i))) return true;
  }
  // Tag characters are astral (surrogate pairs), checked via code points.
  for (const ch of s) {
    if (isHiddenCodePoint(ch.codePointAt(0) as number)) return true;
  }
  return false;
}

/**
 * Replace hidden and control code points with upper-case `\u{HEX}` escapes and
 * limit the result to `maxCodePoints` code points. When the output would be
 * longer, it keeps tokens while the length stays at or below `max - 3` and
 * appends `...`, so it never ends inside an escape.
 */
export function sanitizeText(s: string, maxCodePoints = 120): string {
  const max = Math.max(3, Math.floor(maxCodePoints));
  const tokens: string[] = [];
  let total = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    const token = isHiddenCodePoint(cp) ? `\\u{${cp.toString(16).toUpperCase()}}` : ch;
    tokens.push(token);
    total += token.length === ch.length ? [...token].length : token.length;
  }
  if (total <= max) return tokens.join('');
  let out = '';
  let len = 0;
  for (const token of tokens) {
    const tokenLen = [...token].length;
    if (len + tokenLen > max - 3) break;
    out += token;
    len += tokenLen;
  }
  return `${out}...`;
}
