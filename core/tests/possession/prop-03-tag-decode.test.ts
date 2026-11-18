// Feature: possession, Property 3: A tag run decodes to its ASCII source
// **Validates: Requirements 3.4, 3.7, 13.4**
// Scope: supporting property of P7 (positive direction, rendering). Claimed everywhere.
// Not claimed: decoding of non-tag encodings.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { asciiReporter, insertAt, insertionPoint, ordinaryNoEmoji, tagEncode, toCodePoints } from './arbitraries.js';

const hex4 = (c: number): string => 'U+' + c.toString(16).toUpperCase().padStart(4, '0');

/** Non-empty printable ASCII (U+0020..U+007E). */
const printableAscii: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0x20, max: 0x7e }), { minLength: 1, maxLength: 24 })
  .map((cps) => String.fromCharCode(...cps));

/** Non-empty run of Tag_Characters, mixing printable and out-of-range ones. */
const mixedTagRun: fc.Arbitrary<number[]> = fc.array(
  fc.oneof(
    { weight: 3, arbitrary: fc.integer({ min: 0xe0020, max: 0xe007e }) },
    { weight: 1, arbitrary: fc.integer({ min: 0xe0000, max: 0xe001f }) },
    { weight: 1, arbitrary: fc.constant(0xe007f) },
  ),
  { minLength: 1, maxLength: 12 },
);

const cases = fc
  .tuple(ordinaryNoEmoji, printableAscii)
  .chain(([base, t]) => insertionPoint(base).map((pos) => ({ base, t, pos })));

const mixedCases = fc
  .tuple(ordinaryNoEmoji, mixedTagRun)
  .chain(([base, run]) => insertionPoint(base).map((pos) => ({ base, run, pos })));

const counters = { atStart: 0, atEnd: 0, middle: 0, emptyBase: 0, withSpace: 0, outOfRange: 0, cancel: 0, total: 0 };

describe('Property 3: a tag run decodes to its ASCII source', () => {
  it(
    'rendering equals the ASCII source, length and firstCodePoint match',
    () => {
      fc.assert(
        fc.property(cases, ({ base, t, pos }) => {
          const baseLen = toCodePoints(base).length;
          counters.total++;
          if (pos === 0) counters.atStart++;
          if (pos === baseLen) counters.atEnd++;
          if (pos > 0 && pos < baseLen) counters.middle++;
          if (base === '') counters.emptyBase++;
          if (t.includes(' ')) counters.withSpace++;

          const text = insertAt(base, pos, tagEncode(t));
          const tags = scanText(text).findings.filter((f) => f.category === 'tag');
          expect(tags).toHaveLength(1);
          const f = tags[0]!;
          expect(f.offset).toBe(pos);
          expect(f.rendering).toBe(t);
          expect(f.length).toBe(t.length);
          expect(f.firstCodePoint).toBe(hex4((t.codePointAt(0) as number) + 0xe0000));
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'tag code points outside U+E0020..U+E007E render as <U+XXXX>',
    () => {
      fc.assert(
        fc.property(mixedCases, ({ base, run, pos }) => {
          if (run.some((c) => c < 0xe0020 || c > 0xe007e)) counters.outOfRange++;
          if (run.includes(0xe007f)) counters.cancel++;

          const text = insertAt(base, pos, String.fromCodePoint(...run));
          const tags = scanText(text).findings.filter((f) => f.category === 'tag');
          expect(tags).toHaveLength(1);
          const f = tags[0]!;
          const expected = run
            .map((c) => (c >= 0xe0020 && c <= 0xe007e ? String.fromCharCode(c - 0xe0000) : '<' + hex4(c) + '>'))
            .join('');
          expect(f.offset).toBe(pos);
          expect(f.length).toBe(run.length);
          expect(f.rendering).toBe(expected);
          expect(f.firstCodePoint).toBe(hex4(run[0] as number));
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: "hi" encoded as tags decodes to "hi"', () => {
    const f = scanText(tagEncode('hi')).findings;
    expect(f).toHaveLength(1);
    expect(f[0]!.rendering).toBe('hi');
    expect(f[0]!.firstCodePoint).toBe('U+E0068');
  });

  it('non-vacuity: every input class was generated', () => {
    expect(counters.total).toBeGreaterThan(0);
    expect(counters.atStart).toBeGreaterThan(0);
    expect(counters.atEnd).toBeGreaterThan(0);
    expect(counters.middle).toBeGreaterThan(0);
    expect(counters.emptyBase).toBeGreaterThan(0);
    expect(counters.withSpace).toBeGreaterThan(0);
    expect(counters.outOfRange).toBeGreaterThan(0);
    expect(counters.cancel).toBeGreaterThan(0);
  });
});
