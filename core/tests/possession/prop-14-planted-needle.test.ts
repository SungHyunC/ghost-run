// Feature: possession, Property 14: A planted needle is found, including when hidden in tag characters
// **Validates: Requirements 10.2, 10.6, 13.9**
//
// Scope: supporting property (red thread over hidden text). Claimed everywhere.
// Not claimed: that the planted text caused any action.
//
// Every tag character is built from numbers (0xE0000 + ASCII code). No literal hidden character appears here.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { traceRedThread } from '../../src/possession/red-thread.js';
import type { Needle, ProvenanceKind, ProvenanceLog } from '../../src/possession/types.js';
import { createCounter } from '../pbt-stats.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { asciiReporter } from './arbitraries.js';

const TAG_BASE = 0xe0000;

/** Encode printable ASCII as a run of Tag_Characters (built from numbers). */
function tagRun(text: string): string {
  return String.fromCodePoint(...Array.from(text, (ch) => TAG_BASE + (ch.codePointAt(0) as number)));
}

// Filler never contains '/' or ':', so it can never contain a needle (both forms contain '/').
const FILLER_UNITS = ['a', 'b', 'z', '0', '9', ' ', '.', '-', '\u00e9', String.fromCodePoint(0x1f600)];
const fillerArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...FILLER_UNITS), { maxLength: 12 })
  .map((a) => a.join(''));

const wordArb = fc.stringMatching(/^[a-z0-9]{1,8}$/);
const needleArb: fc.Arbitrary<string> = fc.oneof(
  wordArb.map((w) => '/' + w),
  fc.tuple(wordArb, wordArb).map(([a, b]) => '/' + a + '/' + b),
  fc.tuple(wordArb, fc.option(wordArb, { nil: undefined })).map(
    ([h, p]) => 'https://' + h + '.example' + (p === undefined ? '' : '/' + p),
  ),
);

const BREAKS = ['\n', '\r\n', '\r'] as const;
const KINDS: readonly ProvenanceKind[] = ['file', 'issue', 'web', 'other'];

interface Scenario {
  readonly log: ProvenanceLog;
  readonly needle: string;
  readonly hidden: boolean;
  readonly recordIndex: number;
  readonly lineIndex: number;
  readonly column: number; // 1-based, code points
  readonly hasLaterCopy: boolean;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    records: fc.array(fc.array(fillerArb, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 4 }),
    needle: needleArb,
    hidden: fc.boolean(),
    pick: fc.nat(),
    linePick: fc.nat(),
    prefix: fillerArb,
    suffix: fillerArb,
    brk: fc.constantFrom(...BREAKS),
    laterCopy: fc.boolean(),
    kindPick: fc.nat(),
  })
  .map((s) => {
    const recordIndex = s.pick % s.records.length;
    const lines = (s.records[recordIndex] as string[]).slice();
    const lineIndex = s.linePick % lines.length;
    const plant = s.hidden ? tagRun(s.needle) : s.needle;
    const base = lines[lineIndex] as string;
    lines[lineIndex] = s.prefix + plant + s.suffix + base;
    const column = Array.from(s.prefix).length + 1;

    const contents = s.records.map((r, i) => (i === recordIndex ? lines : r).join(s.brk));
    // A later visible copy in a following record must never win over the chosen plant.
    const hasLaterCopy = s.laterCopy && recordIndex + 1 < contents.length;
    if (hasLaterCopy) contents[recordIndex + 1] = s.needle + s.brk + (contents[recordIndex + 1] as string);

    const log: ProvenanceLog = contents.map((content, i) => ({
      source: 'src-' + String(i),
      kind: KINDS[(s.kindPick + i) % KINDS.length] as ProvenanceKind,
      content,
    }));
    return { log, needle: s.needle, hidden: s.hidden, recordIndex, lineIndex, column, hasLaterCopy };
  });

describe('Property 14: A planted needle is found, including when hidden in tag characters', () => {
  it(
    'traceRedThread finds a visible or tag-hidden needle at the planted record, line, and column',
    () => {
      const counter = createCounter('P14 buckets');
      let runs = 0;
      fc.assert(
        fc.property(scenarioArb, (sc) => {
          runs++;
          const needle: Needle = { value: sc.needle, origin: 'effect', stepIndex: 0 };
          const links = traceRedThread(sc.log, [needle]);
          expect(links).toHaveLength(1);
          const link = links[0];
          expect(link?.status).toBe('found');
          if (link === undefined || link.status !== 'found') return;

          expect(link.recordIndex).toBeLessThanOrEqual(sc.recordIndex);
          // The filler cannot hold the needle, so the plant is the earliest occurrence.
          expect(link.recordIndex).toBe(sc.recordIndex);
          expect(link.line).toBe(sc.lineIndex + 1);
          expect(link.column).toBe(sc.column);
          expect(link.hidden).toBe(sc.hidden);
          expect(link.matchedKey).toBe('value');

          counter.add(sc.hidden ? 'hidden-tag-plant' : 'visible-plant');
          if (sc.lineIndex > 0) counter.add('later-line');
          if (sc.recordIndex > 0) counter.add('later-record');
          if (sc.column > 1) counter.add('column-gt-1');
          if (sc.hasLaterCopy) counter.add('later-visible-copy');
          counter.add(sc.needle.startsWith('/') ? 'path-needle' : 'url-needle');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P14 runs=${runs} (NUM_RUNS=${NUM_RUNS}) ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const bucket of [
        'hidden-tag-plant',
        'visible-plant',
        'later-line',
        'later-record',
        'column-gt-1',
        'later-visible-copy',
        'path-needle',
        'url-needle',
      ]) {
        expect(counter.counts[bucket] ?? 0, `bucket ${bucket} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('finds a URL hidden in tag characters at the column of its first tag character', () => {
    const url = 'https://evil.example/x';
    const log: ProvenanceLog = [
      { source: 'a', kind: 'file', content: 'hi\nok ' + tagRun(url) + ' end' },
    ];
    const [link] = traceRedThread(log, [{ value: url, origin: 'effect', stepIndex: 0 }]);
    expect(link).toMatchObject({ status: 'found', recordIndex: 0, line: 2, column: 4, hidden: true });
  });
});
