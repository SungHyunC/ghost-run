// Feature: possession, Property 5: Findings are well-formed, maximal, sorted, and position-consistent
// **Validates: Requirements 3.1, 3.2, 3.5, 3.6, 3.8, 3.10, 13.7**
//
// Scope: supporting property for P7 (fixes the meaning of a Finding). Claimed everywhere.
// Not claimed: completeness over other Unicode categories.
// All special characters are built from numbers; no literal hidden character appears here.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { createCounter } from '../pbt-stats.js';
import { anyText, asciiReporter, lineBreak, refPosition, toCodePoints } from './arbitraries.js';

const CATEGORY_ORDER = ['tag', 'zero-width', 'bidi', 'html-comment'] as const;
const RUN_CATEGORIES = ['tag', 'zero-width', 'bidi'] as const;

/** Text pieces and Line_Breaks (LF, CRLF, lone CR) interleaved. */
const textWithBreaks: fc.Arbitrary<string> = fc
  .array(fc.oneof({ weight: 3, arbitrary: anyText }, { weight: 2, arbitrary: lineBreak }), {
    maxLength: 8,
  })
  .map((p) => p.join(''));

const inputs = fc.record({ text: textWithBreaks, markdown: fc.boolean() });

describe('Property 5: findings are well-formed, maximal, sorted, position-consistent', () => {
  // Feature: possession, Property 5: Findings are well-formed, maximal, sorted, and position-consistent
  // **Validates: Requirements 3.1, 3.2, 3.5, 3.6, 3.8, 3.10, 13.7**
  it(
    'every finding satisfies the shape, maximality, order, and position rules',
    () => {
      const stats = createCounter('P5-finding-shape');
      let runs = 0;
      fc.assert(
        fc.property(inputs, ({ text, markdown }) => {
          runs++;
          const cps = toCodePoints(text);
          const { findings } = scanText(text, { markdown });

          for (const f of findings) {
            expect(f.length).toBe(f.codePoints.length);
            expect(f.length).toBeGreaterThan(0);
            expect(f.codePoints).toEqual(cps.slice(f.offset, f.offset + f.length));
            expect(f.firstCodePoint).toMatch(/^U\+[0-9A-F]{4,}$/);
            const first = f.codePoints[0] as number;
            expect(f.firstCodePoint).toBe('U+' + first.toString(16).toUpperCase().padStart(4, '0'));
            expect(f.rendering).toMatch(/^[\u0020-\u007e]*$/);
            const pos = refPosition(text, f.offset);
            expect(f.line).toBe(pos.line);
            expect(f.column).toBe(pos.column);
          }

          // Maximality: same-category runs never touch.
          for (const cat of RUN_CATEGORIES) {
            const same = findings.filter((f) => f.category === cat);
            for (let i = 1; i < same.length; i++) {
              const prev = same[i - 1]!;
              expect(prev.offset + prev.length).not.toBe(same[i]!.offset);
            }
          }

          // Sorted by offset, then category order.
          for (let i = 1; i < findings.length; i++) {
            const a = findings[i - 1]!;
            const b = findings[i]!;
            const ka = a.offset - b.offset || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
            expect(ka).toBeLessThanOrEqual(0);
          }

          // Non-vacuity bookkeeping.
          if (findings.length > 0) stats.add('has-findings');
          if (findings.length > 1) stats.add('multiple-findings');
          for (const f of findings) {
            stats.add('category:' + f.category);
            if (f.length > 1) stats.add('multi-code-point');
            if (f.line > 1) stats.add('line>1');
          }
          if (text.includes(String.fromCharCode(0x0d, 0x0a))) stats.add('crlf');
          if (/\r(?!\n)/.test(text)) stats.add('lone-cr');
          if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text)) {
            stats.add('lone-surrogate');
          }
          stats.add(markdown ? 'markdown-true' : 'markdown-false');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      stats.print();
      expect(runs).toBe(NUM_RUNS);
      for (const key of [
        'has-findings',
        'multiple-findings',
        'category:tag',
        'category:zero-width',
        'category:bidi',
        'category:html-comment',
        'multi-code-point',
        'line>1',
        'crlf',
        'lone-cr',
        'lone-surrogate',
        'markdown-true',
        'markdown-false',
      ]) {
        expect(stats.counts[key] ?? 0, `non-vacuity: ${key} (runs=${runs})`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );
});
