// Feature: possession, Property 2: A hidden code point inserted anywhere is flagged at its position
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 13.3**
//
// Scope: P7, positive direction. Claimed everywhere. Not claimed: any other invisible
// code point. The text has no emoji, so no tag character is part of a listed sequence.
// All hidden code points are built from numbers; no literal hidden character appears here.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { createCounter } from '../pbt-stats.js';
import {
  asciiReporter,
  hiddenCodePoint,
  insertAt,
  insertionPoint,
  ordinaryNoEmoji,
  refCategory,
  refPosition,
  toCodePoints,
} from './arbitraries.js';

interface InsertCase {
  readonly text: string;
  readonly index: number;
  readonly cp: number;
}

const ZWJ = 0x200d;
const BOM = 0xfeff;

/** General case: any hidden code point (U+200D weighted up) at a biased position. */
const generalCase: fc.Arbitrary<InsertCase> = fc
  .tuple(
    ordinaryNoEmoji,
    fc.oneof({ weight: 6, arbitrary: hiddenCodePoint }, { weight: 2, arbitrary: fc.constant(ZWJ) }),
  )
  .chain(([text, cp]) => insertionPoint(text).map((index) => ({ text, index, cp })));

/** Leading U+FEFF: inserted at index 0. */
const leadingBomCase: fc.Arbitrary<InsertCase> = ordinaryNoEmoji.map((text) => ({
  text,
  index: 0,
  cp: BOM,
}));

const insertCase: fc.Arbitrary<InsertCase> = fc.oneof(
  { weight: 7, arbitrary: generalCase },
  { weight: 2, arbitrary: leadingBomCase },
);

describe('Property 2: hidden code point inserted anywhere', () => {
  // Feature: possession, Property 2: A hidden code point inserted anywhere is flagged at its position
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 13.3**
  it(
    'flags the inserted code point with its category, offset, line, and column',
    () => {
      const stats = createCounter('P7-insert');
      let runs = 0;
      fc.assert(
        fc.property(insertCase, ({ text, index, cp }) => {
          runs++;
          const inserted = String.fromCodePoint(cp);
          const next = insertAt(text, index, inserted);
          const cps = toCodePoints(next);
          expect(cps[index]).toBe(cp);

          const category = refCategory(cp);
          const hits = scanText(next).findings.filter(
            (f) => f.offset <= index && index < f.offset + f.length,
          );
          expect(hits.length).toBe(1);
          const finding = hits[0]!;
          expect(finding.category).toBe(category);
          expect(finding.offset).toBe(index);
          expect(finding.length).toBe(1);
          expect(finding.codePoints).toEqual([cp]);
          const pos = refPosition(next, index);
          expect(finding.line).toBe(pos.line);
          expect(finding.column).toBe(pos.column);

          // Non-vacuity bookkeeping.
          const before = index > 0 ? cps[index - 1] : undefined;
          if (index === 0) stats.add('index0');
          if (index === cps.length - 1) stats.add('end');
          if (before === 0x0a || before === 0x0d) stats.add('after-line-break');
          if (index > 0 && index < cps.length - 1 && before !== 0x0a && before !== 0x0d) {
            stats.add('inside');
          }
          stats.add('category:' + category);
          if (cp === ZWJ) stats.add('U+200D');
          if (cp === BOM && index === 0) stats.add('leading-U+FEFF');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      stats.print();
      expect(runs).toBe(NUM_RUNS);
      for (const key of [
        'index0',
        'end',
        'after-line-break',
        'inside',
        'category:tag',
        'category:zero-width',
        'category:bidi',
        'U+200D',
        'leading-U+FEFF',
      ]) {
        expect(stats.counts[key] ?? 0, `non-vacuity: ${key} (runs=${runs})`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );
});
