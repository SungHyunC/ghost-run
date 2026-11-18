// Feature: possession, Property 13: The red thread returns the first occurrence
// **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.9, 10.12, 13.8**
//
// Scope: supporting property (O3 earliest-read rule), a lookup rule and not a safety property.
// Claimed everywhere. Not claimed: that the cause line is the real cause, or that built, encoded,
// compressed, or encrypted addresses are found. Uses the revealed-text oracle.
//
// Every hidden character and emoji is built from numbers. The oracle works on code point arrays
// and knows the revealed text by construction (it never calls the scanner).

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { traceRedThread } from '../../src/possession/red-thread.js';
import type { Needle, ProvenanceKind, ProvenanceLog } from '../../src/possession/types.js';
import { createCounter } from '../pbt-stats.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { asciiReporter } from './arbitraries.js';

const LF = 0x0a;
const CR = 0x0d;
const EMOJI = 0x1f600;
const TAG_BASE = 0xe0000;

// -- Generators -----------------------------------------------------------------

// Plain tokens: small alphabet (forces repeated occurrences), upper/lower case, non-BMP, and all
// three Line_Break forms (CR and LF as separate tokens can join into CRLF).
const PLAIN_TOKENS: readonly string[] = [
  'a',
  'b',
  'A',
  '.',
  '/',
  ' ',
  'x',
  String.fromCodePoint(0xe9),
  String.fromCodePoint(EMOJI),
  String.fromCharCode(LF),
  String.fromCharCode(CR),
  String.fromCharCode(CR, LF),
];
const plainArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...PLAIN_TOKENS), { minLength: 1, maxLength: 10 })
  .map((t) => t.join(''));

// Hidden text: printable ASCII, written as tag characters (never a cancel tag, never a flag base).
const HIDDEN_CHARS = ['a', 'b', 'A', '.', '/', ' ', 'x'];
const hiddenArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...HIDDEN_CHARS), { maxLength: 6 })
  .map((c) => c.join(''));

const KINDS: readonly ProvenanceKind[] = ['file', 'issue', 'web', 'other'];

/** A record: optional leading hidden run, then (plain, hidden) pairs. Plain text separates hidden runs. */
interface RecordSpec {
  readonly source: string;
  readonly kind: ProvenanceKind;
  readonly lead: string;
  readonly pieces: readonly { readonly plain: string; readonly hidden: string }[];
}

const recordSpecArb: fc.Arbitrary<RecordSpec> = fc
  .tuple(
    fc.constantFrom('r0', 'r1', 'r2'),
    fc.constantFrom(...KINDS),
    hiddenArb,
    fc.array(fc.record({ plain: plainArb, hidden: hiddenArb }).map((p) => ({ ...p })), {
      minLength: 0,
      maxLength: 4,
    }),
  )
  .map(([source, kind, lead, pieces]) => ({ source, kind, lead, pieces }));

// -- Revealed-text model (by construction) ----------------------------------------

interface RecordModel {
  readonly content: string;
  readonly origCps: number[];
  readonly revCps: number[];
  readonly revOrig: number[];
  readonly revHidden: boolean[];
}

function cps(text: string): number[] {
  return Array.from(text, (ch) => ch.codePointAt(0) as number);
}

function buildModel(spec: RecordSpec): RecordModel {
  const origCps: number[] = [];
  const revCps: number[] = [];
  const revOrig: number[] = [];
  const revHidden: boolean[] = [];
  const addPlain = (text: string): void => {
    for (const cp of cps(text)) {
      revCps.push(cp);
      revOrig.push(origCps.length);
      revHidden.push(false);
      origCps.push(cp);
    }
  };
  const addHidden = (text: string): void => {
    if (text.length === 0) return;
    const first = origCps.length; // a decoded run maps to its first tag
    for (const cp of cps(text)) {
      revCps.push(cp);
      revOrig.push(first);
      revHidden.push(true);
      origCps.push(TAG_BASE + cp);
    }
  };
  addHidden(spec.lead);
  for (const p of spec.pieces) {
    addPlain(p.plain);
    addHidden(p.hidden);
  }
  return { content: String.fromCodePoint(...origCps), origCps, revCps, revOrig, revHidden };
}

/** 1-based line and column (in code points) of an original code point index. */
function lineColumn(origCps: readonly number[], index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index; i++) {
    if (origCps[i] === LF) {
      line += 1;
      column = 1;
    } else if (origCps[i] === CR && origCps[i + 1] !== LF) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

interface Occurrence {
  readonly recordIndex: number;
  readonly line: number;
  readonly column: number;
  readonly hidden: boolean;
}

/** Naive oracle: every record in order, every position of the revealed text; first and total count. */
function oracle(models: readonly RecordModel[], needle: string): { first?: Occurrence; count: number } {
  const n = cps(needle);
  let first: Occurrence | undefined;
  let count = 0;
  models.forEach((m, recordIndex) => {
    for (let s = 0; s + n.length <= m.revCps.length; s++) {
      let ok = true;
      for (let k = 0; k < n.length; k++) {
        if (m.revCps[s + k] !== n[k]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      count += 1;
      if (first === undefined) {
        const pos = lineColumn(m.origCps, m.revOrig[s] as number);
        first = {
          recordIndex,
          line: pos.line,
          column: pos.column,
          hidden: m.revHidden.slice(s, s + n.length).some(Boolean),
        };
      }
    }
  });
  return first === undefined ? { count } : { first, count };
}

// -- Scenario: log plus needle values -------------------------------------------

const scenarioArb = fc
  .array(recordSpecArb, { maxLength: 4 })
  .chain((specs) => {
    const models = specs.map(buildModel);
    const revealed = models.map((m) => String.fromCodePoint(...m.revCps));
    const sliceArb: fc.Arbitrary<string> =
      models.length === 0
        ? fc.constant('')
        : fc
            .tuple(fc.nat({ max: models.length - 1 }), fc.nat(), fc.integer({ min: 1, max: 6 }))
            .map(([r, from, len]) => {
              const c = cps(revealed[r] as string);
              if (c.length === 0) return '';
              const s = from % c.length;
              return String.fromCodePoint(...c.slice(s, s + len));
            });
    const randomArb: fc.Arbitrary<string> = fc
      .array(fc.constantFrom(...PLAIN_TOKENS, 'A', 'ab', 'B'), { minLength: 1, maxLength: 3 })
      .map((t) => t.join(''));
    const needleArb = fc.oneof(
      { weight: 3, arbitrary: sliceArb },
      { weight: 2, arbitrary: randomArb },
    );
    return fc
      .array(needleArb, { maxLength: 6 })
      .map((values) => ({ models, values: values.filter((v) => v.length > 0) }));
  });

describe('Property 13: The red thread returns the first occurrence', () => {
  it(
    'traceRedThread links each needle, in order, to the earliest record, line, and column of the revealed text',
    () => {
      const counter = createCounter('P13 buckets');
      let runs = 0;
      fc.assert(
        fc.property(scenarioArb, ({ models, values }) => {
          runs++;
          const log: ProvenanceLog = models.map((m, i) => ({
            source: `src-${i}`,
            kind: KINDS[i % KINDS.length] as ProvenanceKind,
            content: m.content,
          }));
          const needles: Needle[] = values.map((value, stepIndex) => ({
            value,
            origin: 'effect',
            stepIndex,
          }));
          const logBefore = structuredClone(log);
          const needlesBefore = structuredClone(needles);

          const links = traceRedThread(log, needles);

          // One link per needle, same order; arguments unchanged; pure.
          expect(links.length).toBe(needles.length);
          expect(log).toStrictEqual(logBefore);
          expect(needles).toStrictEqual(needlesBefore);
          expect(traceRedThread(log, needles)).toStrictEqual(links);

          links.forEach((link, i) => {
            expect(link.needle).toStrictEqual(needles[i]);
            const expected = oracle(models, (needles[i] as Needle).value);
            if (expected.first === undefined) {
              counter.add('oracle-none');
              if (link.status === 'found') {
                // No literal occurrence: only the host fallback may link it.
                expect(link.matchedKey).toBe('host');
                counter.add('host-fallback');
              } else {
                counter.add('not-found');
              }
              return;
            }
            expect(link.status).toBe('found');
            if (link.status !== 'found') return;
            const f = expected.first;
            expect(link.matchedKey).toBe('value');
            expect(link.recordIndex).toBe(f.recordIndex);
            expect(link.line).toBe(f.line);
            expect(link.column).toBe(f.column);
            expect(link.hidden).toBe(f.hidden);
            expect(link.source).toBe(`src-${f.recordIndex}`);
            expect(link.kind).toBe(KINDS[f.recordIndex % KINDS.length]);

            counter.add('found-value');
            if (expected.count > 1) counter.add('multiple-occurrences');
            if (f.hidden) counter.add('hidden-match');
            if (f.recordIndex > 0) counter.add('later-record');
            if (f.line > 1) counter.add('later-line');
            if (f.column > 1) counter.add('later-column');
            const content = (log[f.recordIndex] as { content: string }).content;
            if (content.includes('\r\n')) counter.add('crlf-record');
            if (/\r(?!\n)/.test(content)) counter.add('lone-cr-record');
            if (content.includes('\n')) counter.add('lf-record');
            if (/[\ud800-\udbff]/.test((needles[i] as Needle).value)) counter.add('non-bmp-needle');
          });
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P13 runs=${runs} (NUM_RUNS=${NUM_RUNS}) ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const bucket of [
        'found-value',
        'oracle-none',
        'not-found',
        'multiple-occurrences',
        'hidden-match',
        'later-record',
        'later-line',
        'later-column',
        'crlf-record',
        'lone-cr-record',
        'lf-record',
        'non-bmp-needle',
      ]) {
        expect(counter.counts[bucket] ?? 0, `bucket ${bucket} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('fixed example: two records, repeated value, hidden copy decoded from tag characters', () => {
    const hidden = (s: string): string =>
      String.fromCodePoint(...Array.from(s, (c) => TAG_BASE + (c.codePointAt(0) as number)));
    const log: ProvenanceLog = [
      { source: 's0', kind: 'file', content: 'nothing here' },
      { source: 's1', kind: 'web', content: 'x\r\nab ' + hidden('ab') + ' ab' },
    ];
    const [link] = traceRedThread(log, [{ value: 'ab', origin: 'effect', stepIndex: 0 }]);
    expect(link).toMatchObject({
      status: 'found',
      matchedKey: 'value',
      recordIndex: 1,
      line: 2,
      column: 1,
      hidden: false,
    });
  });
});
