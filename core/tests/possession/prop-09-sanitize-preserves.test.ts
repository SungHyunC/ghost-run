// Feature: possession, Property 9: Sanitize preserves visible text
// **Validates: Requirements 7.6, 7.7, 7.8, 7.9**
//
// Scope: supporting property for P7 (negative direction after purification). Claimed everywhere.
// Not claimed: preservation of text inside comments. No literal hidden character appears here.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sanitizeText, scanText } from '../../src/possession/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { createCounter } from '../pbt-stats.js';
import {
  BASE_FLAG,
  ZWJ,
  anyText,
  asciiReporter,
  flagSequence,
  hangul,
  combining,
  lineBreak,
  openerCreatedByRemoval,
  refCategory,
  refFlaggedTagIndices,
  refZwjPermitted,
  toCodePoints,
  zwjSequence,
} from './arbitraries.js';

/** Code point indices that are Hidden_Code_Points, by the independent oracles. */
function hiddenIndices(text: string): Set<number> {
  const cps = toCodePoints(text);
  const tags = refFlaggedTagIndices(cps);
  const out = new Set<number>();
  cps.forEach((c, i) => {
    const cat = refCategory(c);
    if (cat === 'tag') {
      if (tags.has(i)) out.add(i);
    } else if (c === ZWJ) {
      if (!refZwjPermitted(cps, i)) out.add(i);
    } else if (cat !== 'none') {
      out.add(i);
    }
  });
  return out;
}

/** The text with the given code point indices removed, joined as UTF-16 (lone surrogates kept). */
function without(text: string, removed: (i: number) => boolean): string {
  return Array.from(text)
    .filter((_, i) => !removed(i))
    .join('');
}

/** True when `sub` is a subsequence of `full`, compared by UTF-16 code unit. */
function isSubsequence(sub: string, full: string): boolean {
  let j = 0;
  for (let i = 0; i < full.length && j < sub.length; i++) {
    if (full.charCodeAt(i) === sub.charCodeAt(j)) j++;
  }
  return j === sub.length;
}

const keptLooking: fc.Arbitrary<string> = fc.oneof(
  zwjSequence,
  flagSequence,
  hangul,
  combining,
  lineBreak,
  fc.constant(String.fromCodePoint(BASE_FLAG)),
);
/** Text rich in the things that must survive, mixed with arbitrary text. */
const textArb: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      { weight: 2, arbitrary: keptLooking },
      { weight: 3, arbitrary: anyText },
      // removing the hidden characters creates a comment opener: needs a second sanitize round
      { weight: 2, arbitrary: openerCreatedByRemoval },
    ),
    { maxLength: 6 },
  )
  .map((p) => p.join(''));

describe('Property 9: Sanitize preserves visible text', () => {
  // Feature: possession, Property 9: Sanitize preserves visible text
  // **Validates: Requirements 7.6, 7.7, 7.8**
  it(
    'markdown false removes exactly the Hidden_Code_Points, in order',
    () => {
      const stats = createCounter('P9-markdown-false');
      let runs = 0;
      fc.assert(
        fc.property(textArb, (text) => {
          runs++;
          const hidden = hiddenIndices(text);
          const expected = without(text, (i) => hidden.has(i));
          expect(sanitizeText(text, { markdown: false })).toBe(expected);
          stats.add('runs');
          if (hidden.size > 0) stats.add('something-removed');
          if (hidden.size === 0) stats.add('nothing-removed');
          const cps = toCodePoints(text);
          if (cps.includes(ZWJ) && cps.some((_, i) => cps[i] === ZWJ && !hidden.has(i))) stats.add('permitted-zwj-kept');
          if (cps.includes(0xe007f) && cps.some((c, i) => c === 0xe007f && !hidden.has(i))) stats.add('permitted-tag-seq-kept');
          if (cps.some((c) => c >= 0xac00 && c <= 0xd7a3)) stats.add('hangul-kept');
          if (cps.includes(0x0a) || cps.includes(0x0d)) stats.add('line-break-kept');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      stats.print();
      console.log(`P9 markdown-false: NUM_RUNS=${NUM_RUNS}, runs=${runs}`);
      expect(runs).toBe(NUM_RUNS);
      for (const key of [
        'something-removed',
        'nothing-removed',
        'permitted-zwj-kept',
        'permitted-tag-seq-kept',
        'hangul-kept',
        'line-break-kept',
      ]) {
        expect(stats.counts[key] ?? 0, `non-vacuity: ${key} (runs=${runs})`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: possession, Property 9: Sanitize preserves visible text
  // **Validates: Requirements 7.6, 7.9**
  it(
    'markdown true gives a subsequence that keeps every code point outside comments that is not hidden',
    () => {
      const stats = createCounter('P9-markdown-true');
      let runs = 0;
      fc.assert(
        fc.property(textArb, fc.constantFrom(true, undefined), (text, md) => {
          runs++;
          const options = md === undefined ? undefined : { markdown: md };
          const result = sanitizeText(text, options);
          expect(isSubsequence(result, text)).toBe(true);

          const hidden = hiddenIndices(text);
          const inComment = new Set<number>();
          for (const f of scanText(text, options).findings) {
            if (f.category !== 'html-comment') continue;
            for (let k = f.offset; k < f.offset + f.length; k++) inComment.add(k);
          }
          const oneRound = without(text, (i) => hidden.has(i) || inComment.has(i));
          const created = scanText(oneRound, options).findings.length > 0;
          // Without a comment created by the removal, the kept code points are exactly these.
          if (!created) expect(result).toBe(oneRound);
          // With one, further code points go (the next round removes the new Finding).
          else {
            expect(isSubsequence(result, oneRound)).toBe(true);
            expect(result.length).toBeLessThan(oneRound.length);
          }

          stats.add('runs');
          if (inComment.size > 0) stats.add('has-comment');
          if (inComment.size === 0) stats.add('no-comment');
          // Branch: one pass leaves a Finding, so sanitize needs more than one round.
          if (created) stats.add('needs-second-round');
          if (!created && hidden.size > 0) stats.add('hidden-removed');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      stats.print();
      console.log(`P9 markdown-true: NUM_RUNS=${NUM_RUNS}, runs=${runs}`);
      expect(runs).toBe(NUM_RUNS);
      for (const key of ['has-comment', 'no-comment', 'hidden-removed', 'needs-second-round']) {
        expect(stats.counts[key] ?? 0, `non-vacuity: ${key} (runs=${runs})`).toBeGreaterThan(0);
      }
      // The second-round branch is not a rare accident: at least 5% of the runs.
      const ratio = (stats.counts['needs-second-round'] ?? 0) / runs;
      expect(ratio, `needs-second-round ratio ${ratio} (runs=${runs})`).toBeGreaterThanOrEqual(0.05);
    },
    PBT_TIMEOUT ?? 0,
  );
});
