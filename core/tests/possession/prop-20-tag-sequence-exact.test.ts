// Feature: possession, Property 20: A tag run is allowed only as an exact listed sequence
// **Validates: Requirements 2.1, 2.9, 2.10, 2.11, 13.15, 13.17**
// Scope: P7, both directions at the tag-sequence boundary. Claimed everywhere.
// Not claimed: sequences a later Unicode release adds are flagged until the table is regenerated.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/index.js';
import { RGI_TAG_SEQUENCES } from '../../src/possession/tag-sequence-table.generated.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import {
  asciiReporter,
  BASE_FLAG,
  CANCEL_TAG,
  ordinaryNoEmoji,
  refFlaggedTagIndices,
  tagRunCase,
  toCodePoints,
} from './arbitraries.js';

const isTag = (c: number): boolean => c >= 0xe0000 && c <= 0xe007f;

const inputs = fc.tuple(ordinaryNoEmoji, tagRunCase, ordinaryNoEmoji);

const counters = { a: 0, b: 0, c: 0, d: 0, e: 0, flagged: 0, permitted: 0, emptyPrefix: 0, emptySuffix: 0 };

/** Code point indices (in the whole text) covered by findings, optionally of one category. */
function covered(text: string, onlyTag: boolean): Set<number> {
  const out = new Set<number>();
  for (const f of scanText(text).findings) {
    if (onlyTag && f.category !== 'tag') continue;
    for (let k = 0; k < f.length; k++) out.add(f.offset + k);
  }
  return out;
}

describe('Property 20: a tag run is allowed only as an exact listed sequence', () => {
  it(
    'flagged cases (a) to (d) are covered by tag findings; case (e) has no finding',
    () => {
      fc.assert(
        fc.property(inputs, ([prefix, tc, suffix]) => {
          counters[tc.kind]++;
          counters[tc.expected]++;
          if (prefix === '') counters.emptyPrefix++;
          if (suffix === '') counters.emptySuffix++;

          const start = toCodePoints(prefix).length;
          const text = prefix + tc.text + suffix;
          const cps = tc.codePoints;

          if (tc.expected === 'flagged') {
            const cov = covered(text, true);
            cps.forEach((c, i) => {
              if (isTag(c)) expect(cov.has(start + i)).toBe(true);
            });
            // the base flag code point is never part of a finding
            if (cps[0] === BASE_FLAG) expect(covered(text, false).has(start)).toBe(false);
          } else {
            const cov = covered(text, false);
            for (let i = 0; i < cps.length; i++) expect(cov.has(start + i)).toBe(false);
          }

          // independent oracle agrees with the scanner on every tag code point
          const flagged = refFlaggedTagIndices(toCodePoints(text));
          const cov = covered(text, true);
          expect([...cov].sort((x, y) => x - y)).toEqual([...flagged].sort((x, y) => x - y));
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: every listed sequence alone yields no finding', () => {
    for (const entry of RGI_TAG_SEQUENCES) {
      expect(scanText(String.fromCodePoint(...entry)).findings).toHaveLength(0);
    }
  });

  it('fixed example: a listed sequence without its cancel tag is flagged', () => {
    const entry = RGI_TAG_SEQUENCES[0] as readonly number[];
    expect(entry[entry.length - 1]).toBe(CANCEL_TAG);
    const f = scanText(String.fromCodePoint(...entry.slice(0, entry.length - 1))).findings;
    expect(f.filter((x) => x.category === 'tag').length).toBeGreaterThan(0);
  });

  it('non-vacuity: every case kind and both classes were generated', () => {
    expect(counters.a).toBeGreaterThan(0);
    expect(counters.b).toBeGreaterThan(0);
    expect(counters.c).toBeGreaterThan(0);
    expect(counters.d).toBeGreaterThan(0);
    expect(counters.e).toBeGreaterThan(0);
    expect(counters.flagged).toBeGreaterThan(0);
    expect(counters.permitted).toBeGreaterThan(0);
    expect(counters.emptyPrefix).toBeGreaterThan(0);
    expect(counters.emptySuffix).toBeGreaterThan(0);
  });
});
