// Feature: possession, Property 1: Ordinary text is never flagged
// **Validates: Requirements 2.6, 2.8, 2.9, 4.1, 4.4, 4.5, 13.2**
//
// Scope: P7, negative direction. Claimed everywhere. Not claimed: tag characters outside
// a complete listed sequence are flagged by definition; a flag added by a later Unicode
// release is flagged until the table is regenerated.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/scan.js';
import { createCounter } from '../pbt-stats.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import {
  BASE_FLAG,
  ZWJ,
  asciiReporter,
  flagSequence,
  ordinaryText,
  toCodePoints,
} from './arbitraries.js';

const markdownOption: fc.Arbitrary<boolean | undefined> = fc.constantFrom(true, false, undefined);

// The empty string is mixed in explicitly so that bucket is always populated.
const textArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 12, arbitrary: ordinaryText },
);

const isHangul = (c: number): boolean =>
  (c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff);

describe('Property 1: Ordinary text is never flagged', () => {
  it(
    'scanText reports no findings for ordinary text, for any markdown option',
    () => {
      const counter = createCounter('P1 buckets');
      let runs = 0;
      fc.assert(
        fc.property(textArb, markdownOption, (text, markdown) => {
          runs++;
          const cps = toCodePoints(text);
          counter.add('markdown=' + String(markdown));
          if (text === '') counter.add('empty');
          if (cps.includes(BASE_FLAG)) counter.add('flag');
          if (cps.includes(ZWJ)) counter.add('zwj');
          if (cps.some(isHangul)) counter.add('hangul');
          const options = markdown === undefined ? undefined : { markdown };
          expect(scanText(text, options).findings).toEqual([]);
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P1 runs=${runs} ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const bucket of ['empty', 'flag', 'zwj', 'hangul', 'markdown=true', 'markdown=false', 'markdown=undefined']) {
        expect(counter.counts[bucket] ?? 0, `bucket ${bucket} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('each listed flag alone, and the empty string, produce no findings', () => {
    expect(scanText('').findings).toEqual([]);
    fc.assert(
      fc.property(flagSequence, markdownOption, (flag, markdown) => {
        const options = markdown === undefined ? undefined : { markdown };
        expect(scanText(flag, options).findings).toEqual([]);
      }),
      { numRuns: 20, reporter: asciiReporter },
    );
  });
});
