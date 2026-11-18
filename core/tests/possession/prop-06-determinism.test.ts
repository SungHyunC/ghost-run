// Feature: possession, Property 6: Scan is deterministic, total, and JSON-safe
// **Validates: Requirements 2.7, 6.1, 6.2, 6.3, 6.6, 13.6**
//
// Scope: supporting property for P7 (makes "pure function" true). Claimed everywhere.
// Not claimed: running time (covered by the timing example test).

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/scan.js';
import { createCounter } from '../pbt-stats.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { OPENER, anyText, asciiReporter, loneSurrogate } from './arbitraries.js';

type Opts = { readonly markdown?: boolean } | undefined;

// Options objects are built fresh per run (freezing a shared constant would leak between runs).
const optionsArb: fc.Arbitrary<{ kind: string; options: Opts; frozen: boolean }> = fc
  .tuple(fc.constantFrom('undefined', 'empty', 'markdown-undefined', 'true', 'false'), fc.boolean())
  .map(([kind, frozen]) => {
    let options: Opts;
    if (kind === 'empty') options = {};
    else if (kind === 'markdown-undefined') options = { markdown: undefined };
    else if (kind === 'true') options = { markdown: true };
    else if (kind === 'false') options = { markdown: false };
    return { kind: kind === 'true' || kind === 'false' ? 'markdown=' + kind : kind, options, frozen };
  });

// Text kinds: structured mix, raw 16-bit strings (lone surrogates), and long strings.
const longText: fc.Arbitrary<string> = fc
  .tuple(fc.array(anyText, { minLength: 1, maxLength: 6 }), fc.integer({ min: 200, max: 1500 }))
  .map(([parts, times]) => parts.join('').repeat(times));

const textArb: fc.Arbitrary<{ kind: string; text: string }> = fc.oneof(
  { weight: 1, arbitrary: fc.constant({ kind: 'empty', text: '' }) },
  { weight: 8, arbitrary: anyText.map((text) => ({ kind: 'any', text })) },
  { weight: 3, arbitrary: fc.string({ unit: 'binary', maxLength: 200 }).map((text) => ({ kind: 'binary', text })) },
  { weight: 3, arbitrary: fc
      .array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 200 })
      .map((units) => ({ kind: 'bits16', text: String.fromCharCode(...units) })) },
  {
    weight: 2,
    arbitrary: fc
      .tuple(anyText, loneSurrogate, anyText)
      .map(([a, s, b]) => ({ kind: 'lone-surrogate', text: a + s + b })),
  },
  { weight: 1, arbitrary: longText.map((text) => ({ kind: 'long', text })) },
);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
  }
  return o;
}

describe('Property 6: Scan is deterministic, total, and JSON-safe', () => {
  it(
    'scanText never throws, is deterministic, leaves options unchanged, and round-trips through JSON',
    () => {
      const counter = createCounter('P6 buckets');
      let runs = 0;
      fc.assert(
        fc.property(textArb, optionsArb, ({ kind, text }, { kind: optKind, options, frozen }) => {
          runs++;
          counter.add('text=' + kind);
          counter.add('options=' + optKind);
          if (frozen) counter.add('frozen');
          if (text.length >= 100_000) counter.add('long>=100k');
          // Lone surrogate: a high surrogate not followed by low, or a low not preceded by high.
          if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text)) {
            counter.add('has-lone-surrogate');
          }
          if (text.includes(OPENER)) counter.add('has-opener');

          const opts = frozen && options ? deepFreeze(options) : options;
          const optionsBefore = opts === undefined ? undefined : JSON.stringify(opts);
          const textBefore = text.slice();

          const first = scanText(text, opts);
          const second = scanText(text, opts);
          expect(second).toStrictEqual(first);

          if (first.findings.length > 0) counter.add('has-findings');
          else counter.add('no-findings');

          expect(opts === undefined ? undefined : JSON.stringify(opts)).toBe(optionsBefore);
          if (opts !== undefined) expect(Object.isFrozen(opts)).toBe(frozen);
          expect(text).toBe(textBefore);

          const roundTrip: unknown = JSON.parse(JSON.stringify(first));
          expect(roundTrip).toStrictEqual(first);
          expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P6 runs=${runs} ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const bucket of [
        'text=empty',
        'text=any',
        'text=binary',
        'text=bits16',
        'text=lone-surrogate',
        'options=undefined',
        'options=empty',
        'options=markdown=true',
        'options=markdown=false',
        'frozen',
        'has-findings',
        'no-findings',
        'has-lone-surrogate',
        'has-opener',
      ]) {
        expect(counter.counts[bucket] ?? 0, `bucket ${bucket} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('handles a very long string without throwing (Requirement 6.6)', () => {
    const text = 'a'.repeat(1 << 20) + String.fromCharCode(0x200b);
    const r = scanText(text);
    expect(r.findings).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(r))).toStrictEqual(r);
  });
});
