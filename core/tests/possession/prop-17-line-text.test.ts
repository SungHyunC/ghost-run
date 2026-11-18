// Feature: possession, Property 17: Link line text is bounded, safe ASCII
// **Validates: Requirements 10.5, 10.13**
//
// Scope: supporting property (safe display of untrusted text). Claimed everywhere.
// Not claimed: that a long line shows the occurrence.
//
// Hidden characters, lone surrogates, and emoji are built from numbers. No literal hidden character appears here.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { traceRedThread } from '../../src/possession/red-thread.js';
import type { ProvenanceLog } from '../../src/possession/types.js';
import { createCounter } from '../pbt-stats.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { asciiReporter } from './arbitraries.js';

const MAX = 200;
const NEEDLE = '/pq/x';

/** Independent oracle: escape each code point to a token, then keep the longest whole-token prefix <= 200. */
function oracleLineText(line: string): string {
  let out = '';
  for (const ch of line) {
    const cp = ch.codePointAt(0) as number;
    const token =
      cp >= 0x20 && cp <= 0x7e ? ch : '<U+' + cp.toString(16).toUpperCase().padStart(4, '0') + '>';
    if (out.length + token.length > MAX) break;
    out += token;
  }
  return out;
}

// None of these units is '/', so filler never contains the needle.
const UNITS: readonly string[] = [
  'a',
  'Z',
  '0',
  ' ',
  '<',
  '>',
  '~',
  String.fromCharCode(0x09),
  String.fromCharCode(0x7f),
  String.fromCharCode(0x00),
  '\u00e9',
  '\u4e2d',
  String.fromCharCode(0xd800),
  String.fromCharCode(0xdc00),
  String.fromCodePoint(0x200b),
  String.fromCodePoint(0x202e),
  String.fromCodePoint(0x1f600),
  String.fromCodePoint(0xe0041),
  String.fromCodePoint(0x10ffff),
];
const unitArb = fc.constantFrom(...UNITS);
const shortArb = fc.array(unitArb, { maxLength: 10 }).map((a) => a.join(''));
// Long fillers push the escaped line past 200 characters.
const longArb = fc
  .tuple(fc.array(unitArb, { minLength: 1, maxLength: 12 }), fc.integer({ min: 20, max: 80 }))
  .map(([a, n]) => a.join('').repeat(n));
const fillerArb = fc.oneof({ weight: 3, arbitrary: shortArb }, { weight: 2, arbitrary: longArb });

const BREAKS = ['\n', '\r\n', '\r'] as const;

interface Scenario {
  readonly content: string;
  readonly line: string;
  readonly lineIndex: number;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    before: fc.array(fillerArb, { maxLength: 3 }),
    prefix: fillerArb,
    suffix: fillerArb,
    after: fc.array(fillerArb, { maxLength: 3 }),
    brk: fc.constantFrom(...BREAKS),
  })
  .map((s) => {
    const line = s.prefix + NEEDLE + s.suffix;
    const content = [...s.before, line, ...s.after].join(s.brk);
    return { content, line, lineIndex: s.before.length };
  });

describe('Property 17: Link line text is bounded, safe ASCII', () => {
  it(
    'lineText is printable ASCII, at most 200 characters, the escaped truncated line, and JSON-stable',
    () => {
      const counter = createCounter('P17 buckets');
      let runs = 0;
      fc.assert(
        fc.property(scenarioArb, (sc) => {
          runs++;
          const log: ProvenanceLog = [{ source: 's', kind: 'file', content: sc.content }];
          const [link] = traceRedThread(log, [{ value: NEEDLE, origin: 'effect', stepIndex: 0 }]);
          expect(link?.status).toBe('found');
          if (link === undefined || link.status !== 'found') return;

          expect(link.line).toBe(sc.lineIndex + 1);
          expect(link.lineText).toMatch(/^[\u0020-\u007e]*$/);
          expect(link.lineText.length).toBeLessThanOrEqual(MAX);
          expect(link.lineText).toBe(oracleLineText(sc.line));
          expect(JSON.parse(JSON.stringify(link))).toEqual(link);

          counter.add(link.lineText.length >= MAX - 9 ? 'near-limit' : 'short');
          if (/<U\+/.test(link.lineText)) counter.add('has-escape');
          if (link.lineText.length < escapedLength(sc.line)) counter.add('truncated');
          else counter.add('not-truncated');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P17 runs=${runs} (NUM_RUNS=${NUM_RUNS}) ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const bucket of ['truncated', 'not-truncated', 'has-escape', 'near-limit', 'short']) {
        expect(counter.counts[bucket] ?? 0, `bucket ${bucket} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('cuts at a whole token and never inside an escape', () => {
    // 'a' x 197 then a hidden code point: the escape needs 8 characters and does not fit.
    const line = NEEDLE + 'a'.repeat(MAX - NEEDLE.length - 3) + String.fromCodePoint(0x200b) + 'tail';
    const [link] = traceRedThread([{ source: 's', kind: 'file', content: line }], [
      { value: NEEDLE, origin: 'effect', stepIndex: 0 },
    ]);
    expect(link).toMatchObject({ status: 'found' });
    const text = link?.status === 'found' ? link.lineText : '';
    expect(text).toBe(NEEDLE + 'a'.repeat(MAX - NEEDLE.length - 3));
    expect(text).not.toContain('<');
  });
});

function escapedLength(line: string): number {
  let n = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0) as number;
    n += cp >= 0x20 && cp <= 0x7e ? 1 : 3 + Math.max(4, cp.toString(16).length) + 1;
  }
  return n;
}
