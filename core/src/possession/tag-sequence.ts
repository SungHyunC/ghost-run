// Permitted_Tag_Sequence recognition: bounded lookahead plus exact match against
// the generated RGI_Emoji_Tag_Sequence table. Pure, no dependency.

import { RGI_TAG_SEQUENCES } from './tag-sequence-table.generated.js';

/** Length in UTF-16 code units of one code point. */
function unitLength(cp: number): number {
  return cp > 0xffff ? 2 : 1;
}

function seqUnits(seq: readonly number[]): number {
  let n = 0;
  for (const cp of seq) n += unitLength(cp);
  return n;
}

export const TAG_SEQUENCE_STRINGS: ReadonlySet<string> = new Set(
  RGI_TAG_SEQUENCES.map((seq) => String.fromCodePoint(...seq)),
);

export const TAG_SEQUENCE_UNIT_LENGTHS: ReadonlySet<number> = new Set(
  RGI_TAG_SEQUENCES.map(seqUnits),
);

export const MAX_SEQ_UNITS: number = Math.max(0, ...RGI_TAG_SEQUENCES.map(seqUnits));

/**
 * Called at a U+1F3F4 whose first code unit is at index `u`. Returns the UTF-16
 * index just after the cancel tag when the code points from the base through the
 * first cancel tag equal a listed sequence exactly, otherwise -1.
 */
export function permittedTagSequenceEnd(text: string, u: number): number {
  let i = u + 2;
  let cancelEnd = -1;
  while (i - u < MAX_SEQ_UNITS) {
    // charCodeAt returns NaN past the end, which fails both comparisons.
    if (text.charCodeAt(i) !== 0xdb40) break;
    const low = text.charCodeAt(i + 1);
    if (!(low >= 0xdc00 && low <= 0xdc7f)) break;
    if (low === 0xdc7f) {
      cancelEnd = i + 2;
      break;
    }
    i += 2;
  }
  if (cancelEnd < 0) return -1;
  if (!TAG_SEQUENCE_UNIT_LENGTHS.has(cancelEnd - u)) return -1;
  return TAG_SEQUENCE_STRINGS.has(text.slice(u, cancelEnd)) ? cancelEnd : -1;
}
