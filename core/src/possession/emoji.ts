// Emoji rules for the ZWJ exception. Pure, table driven, no dependency.

import { EXTENDED_PICTOGRAPHIC_RANGES } from './emoji-table.generated.js';

/** True when cp is Extended_Pictographic in the pinned Unicode release. */
export function isExtendedPictographic(cp: number): boolean {
  if (cp < 0xa9) return false;
  const r = EXTENDED_PICTOGRAPHIC_RANGES;
  let lo = 0;
  let hi = (r.length >> 1) - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const rangeLo = r[mid * 2] as number;
    const rangeHi = r[mid * 2 + 1] as number;
    if (cp < rangeLo) hi = mid - 1;
    else if (cp > rangeHi) lo = mid + 1;
    else return true;
  }
  return false;
}

/** True for U+FE0F and the skin tone modifiers U+1F3FB to U+1F3FF. */
export function isEmojiModifier(cp: number): boolean {
  return cp === 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff);
}

/** Code point that ends at (exclusive) index `end`, with its width, or null at the start. */
function codePointBefore(text: string, end: number): { cp: number; width: number } | null {
  if (end <= 0) return null;
  const low = text.charCodeAt(end - 1);
  if (low >= 0xdc00 && low <= 0xdfff && end >= 2) {
    const high = text.charCodeAt(end - 2);
    if (high >= 0xd800 && high <= 0xdbff) {
      return { cp: ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000, width: 2 };
    }
  }
  return { cp: low, width: 1 };
}

/** Code point that starts at index `start`, with its width, or null at the end. */
function codePointAt(text: string, start: number): { cp: number; width: number } | null {
  if (start >= text.length) return null;
  const high = text.charCodeAt(start);
  if (high >= 0xd800 && high <= 0xdbff && start + 1 < text.length) {
    const low = text.charCodeAt(start + 1);
    if (low >= 0xdc00 && low <= 0xdfff) {
      return { cp: ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000, width: 2 };
    }
  }
  return { cp: high, width: 1 };
}

/**
 * True when the U+200D at UTF-16 index `u` sits between two Extended_Pictographic
 * code points, skipping Emoji_Modifiers on each side.
 */
export function isPermittedZwj(text: string, u: number): boolean {
  let back = u;
  let prev = codePointBefore(text, back);
  while (prev !== null && isEmojiModifier(prev.cp)) {
    back -= prev.width;
    prev = codePointBefore(text, back);
  }
  if (prev === null || !isExtendedPictographic(prev.cp)) return false;

  let fwd = u + 1;
  let next = codePointAt(text, fwd);
  while (next !== null && isEmojiModifier(next.cp)) {
    fwd += next.width;
    next = codePointAt(text, fwd);
  }
  return next !== null && isExtendedPictographic(next.cp);
}
