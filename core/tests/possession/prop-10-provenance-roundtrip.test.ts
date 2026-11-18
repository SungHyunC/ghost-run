// Feature: possession, Property 10: Provenance log round trip
// **Validates: Requirements 8.1, 8.2, 8.3, 8.7, 8.8, 13.11**
//
// Scope: supporting property (record format). Claimed everywhere.
// Not claimed: that the later hook fills the log correctly.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseProvenanceLog, serializeProvenanceLog } from '../../src/possession/provenance.js';
import type { ProvenanceKind, ProvenanceRecord } from '../../src/possession/types.js';
import { createCounter } from '../pbt-stats.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { anyText, asciiReporter, loneSurrogate } from './arbitraries.js';

const kindArb: fc.Arbitrary<ProvenanceKind> = fc.constantFrom('file', 'issue', 'web', 'other');

// Non-empty source: free 16-bit strings (including lone surrogates) or plain names.
const sourceArb: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^[a-z]{1,8}(\/[a-z]{1,8}){0,2}\.(md|txt)$/),
  fc.string({ unit: 'binary', minLength: 1, maxLength: 30 }),
  fc.constantFrom('__proto__', 'constructor', 'toString', 'source', 'a'),
);

// Content: any string, including hidden characters, lone surrogates, and raw 16-bit units.
const contentArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 4, arbitrary: anyText },
  { weight: 2, arbitrary: fc.string({ unit: 'binary', maxLength: 100 }) },
  {
    weight: 2,
    arbitrary: fc
      .array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 100 })
      .map((units) => String.fromCharCode(...units)),
  },
  {
    weight: 2,
    arbitrary: fc.tuple(anyText, loneSurrogate, anyText).map(([a, s, b]) => a + s + b),
  },
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      '"quoted"',
      String.fromCharCode(0x5c, 0x6e),
      String.fromCharCode(0x0a, 0x0d, 0x09, 0x08, 0x0c, 0x00),
      String.fromCharCode(0x2028, 0x2029),
    ),
  },
);

const recordArb: fc.Arbitrary<ProvenanceRecord> = fc
  .record({ source: sourceArb, kind: kindArb, content: contentArb })
  .map(({ source, kind, content }) => ({ source, kind, content }));

const logArb: fc.Arbitrary<ProvenanceRecord[]> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<ProvenanceRecord[]>([]) },
  { weight: 9, arbitrary: fc.array(recordArb, { maxLength: 8 }) },
);

const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const HIDDEN = /[\u200b-\u200d\u2060\ufeff\u202a-\u202e\u2066-\u2069]|\udb40[\udc00-\udc7f]/;

describe('Property 10: Provenance log round trip', () => {
  it(
    'parse(serialize(log)) is ok and structurally equal to log, in order',
    () => {
      const counter = createCounter('P10 buckets');
      let runs = 0;
      fc.assert(
        fc.property(logArb, (log) => {
          runs++;
          counter.add(log.length === 0 ? 'empty-log' : log.length === 1 ? 'one-record' : 'many-records');
          for (const r of log) {
            counter.add('kind=' + r.kind);
            if (r.content === '') counter.add('empty-content');
            if (LONE.test(r.content)) counter.add('lone-surrogate');
            if (HIDDEN.test(r.content)) counter.add('hidden-chars');
          }

          const snapshot = log.map((r) => ({ ...r }));
          const text = serializeProvenanceLog(log);
          expect(typeof text).toBe('string');
          expect(log).toStrictEqual(snapshot); // serialize leaves its input unchanged

          const result = parseProvenanceLog(text);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.log).toStrictEqual(log);
            expect(result.log).toHaveLength(log.length);
            for (const r of result.log) {
              expect(Object.keys(r)).toStrictEqual(['source', 'kind', 'content']);
            }
          }
          // Serializing the parsed log gives the same text (stable format).
          if (result.ok) expect(serializeProvenanceLog(result.log)).toBe(text);
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P10 runs=${runs} ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const bucket of [
        'empty-log',
        'one-record',
        'many-records',
        'kind=file',
        'kind=issue',
        'kind=web',
        'kind=other',
        'empty-content',
        'lone-surrogate',
        'hidden-chars',
      ]) {
        expect(counter.counts[bucket] ?? 0, `bucket ${bucket} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('round-trips the empty log', () => {
    expect(serializeProvenanceLog([])).toBe('[]');
    expect(parseProvenanceLog('[]')).toStrictEqual({ ok: true, log: [] });
  });
});
