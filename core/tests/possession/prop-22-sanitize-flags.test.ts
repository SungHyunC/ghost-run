// Feature: possession, Property 22: Sanitize keeps listed flags, removes other tags, and is idempotent
// **Validates: Requirements 7.4, 7.5, 7.6, 7.11, 13.16**
// Scope: supporting property for P7 (negative direction after purification, for flags).
// Claimed everywhere. Not claimed: that removing tags makes text safe in any other sense.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sanitizeText, scanText } from '../../src/possession/index.js';
import { RGI_TAG_SEQUENCES } from '../../src/possession/tag-sequence-table.generated.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import {
  BASE_FLAG,
  appendedTags,
  asciiReporter,
  flagSequence,
  flagSequenceCodePoints,
  ordinaryNoEmoji,
  tagRunCase,
  toCodePoints,
} from './arbitraries.js';

const counters = {
  total: 0,
  withFlagKept: 0,
  withFlagAppendedTags: 0,
  withTagRunFlagged: 0,
  withOtherHidden: 0,
  withBrokenFlag: 0,
  markdownFalse: 0,
  markdownTrue: 0,
  markdownUndefined: 0,
  emptyAfter: 0,
  changed: 0,
  unchanged: 0,
};

// Hidden code points other than tags and U+200D (a lone ZWJ between ordinary pieces is
// flagged too, but keeping it out avoids coupling this property to the ZWJ rules).
const otherHidden: fc.Arbitrary<string> = fc
  .oneof(
    fc.constantFrom(0x200b, 0x200c, 0x2060, 0xfeff),
    fc.integer({ min: 0x202a, max: 0x202e }),
    fc.integer({ min: 0x2066, max: 0x2069 }),
  )
  .map((c) => String.fromCodePoint(c));

const tagChars: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0xe0000, max: 0xe007f }), { minLength: 1, maxLength: 6 })
  .map((a) => String.fromCodePoint(...a));

const piece: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: ordinaryNoEmoji },
  { weight: 3, arbitrary: flagSequence },
  { weight: 3, arbitrary: fc.tuple(flagSequence, appendedTags).map(([f, t]) => f + String.fromCodePoint(...t)) },
  { weight: 3, arbitrary: tagRunCase.map((c) => c.text) },
  { weight: 2, arbitrary: otherHidden },
  { weight: 2, arbitrary: tagChars },
  // a listed sequence with its cancel tag missing
  { weight: 1, arbitrary: flagSequenceCodePoints.map((e) => String.fromCodePoint(...e.slice(0, e.length - 1))) },
);

const text: fc.Arbitrary<string> = fc.array(piece, { maxLength: 12 }).map((p) => p.join(''));

const markdownOption: fc.Arbitrary<boolean | undefined> = fc.constantFrom(false, false, true, undefined);

const isTag = (c: number): boolean => c >= 0xe0000 && c <= 0xe007f;
const isOtherHidden = (c: number): boolean =>
  c === 0x200b || c === 0x200c || c === 0x2060 || c === 0xfeff ||
  (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);

/** Length of the listed sequence starting at index i, or 0. Written apart from the module. */
function listedLengthAt(cps: readonly number[], i: number): number {
  for (const e of RGI_TAG_SEQUENCES) {
    if (e.length <= cps.length - i && e.every((v, k) => cps[i + k] === v)) return e.length;
  }
  return 0;
}

interface Reference {
  readonly kept: number[];
  readonly flags: number;
}

/** Keep everything except tags outside a listed sequence and the other hidden code points. */
function reference(cps: readonly number[]): Reference {
  const kept: number[] = [];
  let flags = 0;
  let i = 0;
  while (i < cps.length) {
    const c = cps[i] as number;
    const n = c === BASE_FLAG ? listedLengthAt(cps, i) : 0;
    if (n > 0) {
      for (let k = 0; k < n; k++) kept.push(cps[i + k] as number);
      flags++;
      i += n;
    } else {
      if (!isTag(c) && !isOtherHidden(c)) kept.push(c);
      i++;
    }
  }
  return { kept, flags };
}

describe('Property 22: sanitize keeps listed flags, removes other tags, and is idempotent', () => {
  it(
    'result equals the reference, keeps listed flags, has no stray tag, is idempotent and clean',
    () => {
      fc.assert(
        fc.property(text, markdownOption, (input, markdown) => {
          const cps = toCodePoints(input);
          const ref = reference(cps);
          const options = markdown === undefined ? undefined : { markdown };
          const out = sanitizeText(input, options);

          counters.total++;
          if (ref.flags > 0) counters.withFlagKept++;
          if (cps.some(isTag) && cps.length > ref.kept.length) counters.withTagRunFlagged++;
          if (cps.some(isOtherHidden)) counters.withOtherHidden++;
          if (/\u{1F3F4}/u.test(input) && ref.flags === 0) counters.withBrokenFlag++;
          if (markdown === false) counters.markdownFalse++;
          else if (markdown === true) counters.markdownTrue++;
          else counters.markdownUndefined++;
          if (out === '') counters.emptyAfter++;
          if (out === input) counters.unchanged++;
          else counters.changed++;

          // The input has no comment opener only when markdown is off, or by luck; compare the
          // reference only where comment removal cannot apply.
          const mayHaveComment = markdown !== false && input.includes(String.fromCharCode(0x3c, 0x21, 0x2d, 0x2d));
          if (!mayHaveComment) {
            expect(toCodePoints(out)).toEqual(ref.kept);
          }

          const outCps = toCodePoints(out);
          // every tag code point left belongs to a listed sequence
          const again = reference(outCps);
          expect(again.kept).toEqual(outCps);
          for (let i = 0; i < outCps.length; i++) {
            if (isTag(outCps[i] as number)) {
              // walk back to the base and check the listed sequence covers i
              let b = i;
              while (b > 0 && isTag(outCps[b] as number)) b--;
              const n = listedLengthAt(outCps, b);
              expect(outCps[b]).toBe(BASE_FLAG);
              expect(b + n > i).toBe(true);
            }
          }
          expect(sanitizeText(out, options)).toBe(out);
          expect(scanText(out, options).findings).toHaveLength(0);
          if (!mayHaveComment) counters.withFlagAppendedTags += /* flags intact */ ref.flags > 0 ? 1 : 0;
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'a listed flag followed by appended tags becomes exactly the flag',
    () => {
      fc.assert(
        fc.property(flagSequenceCodePoints, appendedTags, ordinaryNoEmoji, (seq, tags, prefix) => {
          const flag = String.fromCodePoint(...seq);
          const input = flag + String.fromCodePoint(...tags);
          expect(sanitizeText(input, { markdown: false })).toBe(flag);
          const withPrefix = prefix + input;
          expect(sanitizeText(withPrefix, { markdown: false })).toBe(prefix + flag);
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: England flag plus two appended letter tags is exactly the flag', () => {
    const seq = [0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f];
    const flag = String.fromCodePoint(...seq);
    expect(sanitizeText(flag + String.fromCodePoint(0xe0061, 0xe0062))).toBe(flag);
  });

  it('non-vacuity: every input class was generated', () => {
    // eslint-disable-next-line no-console
    console.log(`Property 22 runs per property: ${NUM_RUNS}`, JSON.stringify(counters));
    expect(counters.total).toBeGreaterThan(0);
    expect(counters.withFlagKept).toBeGreaterThan(0);
    expect(counters.withTagRunFlagged).toBeGreaterThan(0);
    expect(counters.withOtherHidden).toBeGreaterThan(0);
    expect(counters.withBrokenFlag).toBeGreaterThan(0);
    expect(counters.withFlagAppendedTags).toBeGreaterThan(0);
    expect(counters.markdownFalse).toBeGreaterThan(0);
    expect(counters.markdownTrue).toBeGreaterThan(0);
    expect(counters.markdownUndefined).toBeGreaterThan(0);
    expect(counters.changed).toBeGreaterThan(0);
    expect(counters.unchanged).toBeGreaterThan(0);
  });
});
