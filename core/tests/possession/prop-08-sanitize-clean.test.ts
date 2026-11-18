// Feature: possession, Property 8: Sanitize returns clean, idempotent output and leaves clean text alone
// **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.10, 13.5, 13.6**
//
// Scope: supporting property for P7 (purification uses the positive direction). Claimed everywhere.
// Not claimed: that sanitized text is semantically safe.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/scan.js';
import { sanitizeText } from '../../src/possession/sanitize.js';
import { createCounter } from '../pbt-stats.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { OPENER, anyText, asciiReporter, loneSurrogate } from './arbitraries.js';

type Opts = { readonly markdown?: boolean } | undefined;

const optionsArb: fc.Arbitrary<{ kind: string; options: Opts }> = fc.constantFrom<{
  kind: string;
  options: Opts;
}>(
  { kind: 'undefined', options: undefined },
  { kind: 'empty', options: {} },
  { kind: 'markdown=true', options: { markdown: true } },
  { kind: 'markdown=false', options: { markdown: false } },
);

const textArb: fc.Arbitrary<{ kind: string; text: string }> = fc.oneof(
  { weight: 1, arbitrary: fc.constant({ kind: 'empty', text: '' }) },
  { weight: 8, arbitrary: anyText.map((text) => ({ kind: 'any', text })) },
  { weight: 3, arbitrary: fc.string({ maxLength: 60 }).map((text) => ({ kind: 'plain', text })) },
  { weight: 2, arbitrary: fc.string({ unit: 'binary', maxLength: 100 }).map((text) => ({ kind: 'binary', text })) },
  {
    weight: 2,
    arbitrary: fc
      .tuple(anyText, loneSurrogate, anyText)
      .map(([a, s, b]) => ({ kind: 'lone-surrogate', text: a + s + b })),
  },
  {
    // Zero-width space inside an opener: removing it joins the opener, so sanitize must repeat.
    weight: 2,
    arbitrary: fc
      .tuple(anyText, fc.integer({ min: 1, max: 3 }), anyText)
      .map(([a, cut, b]) => ({
        kind: 'joined-opener',
        text: a + OPENER.slice(0, cut) + String.fromCharCode(0x200b) + OPENER.slice(cut) + b,
      })),
  },
);

describe('Property 8: Sanitize returns clean, idempotent output and leaves clean text alone', () => {
  it(
    'sanitized text has no findings, sanitize is idempotent, and clean text is returned unchanged',
    () => {
      const counter = createCounter('P8 buckets');
      let runs = 0;
      fc.assert(
        fc.property(textArb, optionsArb, ({ kind, text }, { kind: optKind, options }) => {
          runs++;
          counter.add('text=' + kind);
          counter.add('options=' + optKind);
          const before = text.slice();

          const before_scan = scanText(text, options);
          const out = sanitizeText(text, options);
          expect(text).toBe(before);

          expect(scanText(out, options).findings).toStrictEqual([]);
          expect(sanitizeText(out, options)).toBe(out);

          if (before_scan.findings.length === 0) {
            counter.add('input-clean');
            expect(out).toBe(text);
          } else {
            counter.add('input-dirty');
            expect(out.length).toBeLessThan(text.length);
          }
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P8 runs=${runs} ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const bucket of [
        'text=empty',
        'text=any',
        'text=plain',
        'text=lone-surrogate',
        'text=joined-opener',
        'options=undefined',
        'options=markdown=true',
        'options=markdown=false',
        'input-clean',
        'input-dirty',
      ]) {
        expect(counter.counts[bucket] ?? 0, `bucket ${bucket} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );
});
