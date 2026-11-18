// Sanitizer: removes every Finding and repeats until the scan is clean. Pure.
// Output is built from slices of the input, so kept code units are preserved exactly.

import { scanInternal } from './scan.js';
import type { ScanOptions } from './types.js';

/** Remove the merged UTF-16 ranges of one scan round from `text`. */
function cutRanges(
  text: string,
  entries: readonly { readonly unitStart: number; readonly unitEnd: number }[],
): string {
  const sorted = [...entries].sort((a, b) => a.unitStart - b.unitStart || a.unitEnd - b.unitEnd);
  const parts: string[] = [];
  let cutEnd = 0; // end of the removed range being built; text before it is emitted or removed
  for (const entry of sorted) {
    if (entry.unitStart > cutEnd) {
      // Gap after the previous removed range: keep it.
      parts.push(text.slice(cutEnd, entry.unitStart));
    }
    // Overlapping, touching, or new range: removal extends to the furthest end.
    if (entry.unitEnd > cutEnd) cutEnd = entry.unitEnd;
  }
  parts.push(text.slice(cutEnd));
  return parts.join('');
}

/** Remove hidden text from `text` until `scanText` finds nothing. Pure, never throws. */
export function sanitizeText(text: string, options?: ScanOptions): string {
  const markdown = options?.markdown !== false;
  let cur = text;
  for (;;) {
    const entries = scanInternal(cur, markdown);
    if (entries.length === 0) return cur;
    cur = cutRanges(cur, entries);
  }
}
