// Feature: possession, Property 15: No occurrence gives not-found
// **Validates: Requirements 10.10, 10.11, 13.10**
//
// Scope: supporting property (no guessing). Claimed everywhere.
// A `not-found` link never changes a verdict.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { traceRedThread } from '../../src/possession/red-thread.js';
import type { Needle, NeedleOrigin, ProvenanceKind, ProvenanceLog } from '../../src/possession/types.js';
import { createCounter } from '../pbt-stats.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { asciiReporter } from './arbitraries.js';

// Log alphabet: no ASCII letters, no tag characters, so no Needle value below
// (each holds at least one ASCII letter) and no host can occur in the revealed text.
const LOG_UNITS: readonly string[] = [
  '0', '1', '9', ' ', '\n', '\r', '\t', '/', ':', '.', '-', '_', '@', '#', '=', '[', ']',
  '\u00e9', '\u00fc', '\u4e2d', '\u200b', '\ud83d\ude00', '\ud83d', '\ude00',
];
const contentArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...LOG_UNITS), { maxLength: 40 })
  .map((parts) => parts.join(''));
const recordArb = fc.record({
  source: fc.constantFrom('a.txt', 'issue-1', 'page'),
  kind: fc.constantFrom<ProvenanceKind>('file', 'issue', 'web', 'other'),
  content: contentArb,
});
const logArb: fc.Arbitrary<ProvenanceLog> = fc
  .array(recordArb, { maxLength: 5 })
  .map((rs) => rs.map((r) => ({ source: r.source, kind: r.kind, content: r.content })));

// Needle values with a letter: plain paths, hosts, full URLs with userinfo/port/path.
const wordArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,6}$/);
const needleValueArb: fc.Arbitrary<string> = fc.oneof(
  wordArb,
  wordArb.map((w) => '/' + w + '/x'),
  wordArb.map((w) => w + '.example'),
  fc.tuple(wordArb, fc.boolean(), fc.boolean()).map(
    ([w, port, path]) => 'https://' + w + '.test' + (port ? ':8080' : '') + (path ? '/p' : ''),
  ),
  fc.tuple(wordArb, wordArb).map(([u, h]) => 'http://' + u + '@' + h + '.invalid/q'),
);
const originArb = fc.constantFrom<NeedleOrigin>('effect', 'observed-destination', 'observed-path');
const needleArb: fc.Arbitrary<Needle> = fc
  .tuple(needleValueArb, originArb, fc.integer({ min: 0, max: 4 }))
  .map(([value, origin, stepIndex]) => ({ value, origin, stepIndex }));
const needlesArb = fc.array(needleArb, { maxLength: 6 });

// For the empty log, any string is allowed as a needle value, including empty.
const anyNeedleArb: fc.Arbitrary<Needle> = fc
  .tuple(fc.oneof(needleValueArb, fc.string({ maxLength: 12 })), originArb, fc.integer({ min: 0, max: 4 }))
  .map(([value, origin, stepIndex]) => ({ value, origin, stepIndex }));
const anyNeedlesArb = fc.array(anyNeedleArb, { maxLength: 6 });

function expectAllNotFound(links: ReturnType<typeof traceRedThread>, needles: readonly Needle[]): void {
  expect(links.length).toBe(needles.length);
  links.forEach((link, i) => {
    expect(link.status).toBe('not-found');
    expect(link.needle).toStrictEqual(needles[i]);
    expect(Object.keys(link).sort()).toStrictEqual(['needle', 'status']);
    for (const key of ['source', 'line', 'column', 'recordIndex', 'lineText', 'hidden', 'kind', 'matchedKey']) {
      expect(key in link, `unexpected key ${key}`).toBe(false);
    }
  });
}

describe('Property 15: No occurrence gives not-found', () => {
  it(
    'every Needle is not-found when the log alphabet cannot contain its value or host',
    () => {
      const counter = createCounter('P15 buckets');
      let runs = 0;
      fc.assert(
        fc.property(logArb, needlesArb, (log, needles) => {
          runs++;
          expectAllNotFound(traceRedThread(log, needles), needles);
          counter.add(log.length === 0 ? 'empty-log' : 'non-empty-log');
          counter.add(needles.length === 0 ? 'no-needles' : 'has-needles');
          if (needles.some((n) => n.value.includes('://'))) counter.add('url-needle');
          if (needles.some((n) => !n.value.includes('://'))) counter.add('plain-needle');
          if (log.some((r) => r.content.includes('\ud83d\ude00'))) counter.add('log-with-emoji');
          if (log.some((r) => r.content.length > 0)) counter.add('log-with-text');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P15a runs=${runs} (NUM_RUNS=${NUM_RUNS}) ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const b of ['empty-log', 'non-empty-log', 'no-needles', 'has-needles', 'url-needle', 'plain-needle', 'log-with-emoji', 'log-with-text']) {
        expect(counter.counts[b] ?? 0, `bucket ${b} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it(
    'an empty log gives not-found for every Needle',
    () => {
      const counter = createCounter('P15 empty-log buckets');
      let runs = 0;
      fc.assert(
        fc.property(anyNeedlesArb, (needles) => {
          runs++;
          expectAllNotFound(traceRedThread([], needles), needles);
          counter.add(needles.length === 0 ? 'no-needles' : 'has-needles');
          if (needles.some((n) => n.value === '')) counter.add('empty-value');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P15b runs=${runs} (NUM_RUNS=${NUM_RUNS}) ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const b of ['no-needles', 'has-needles']) {
        expect(counter.counts[b] ?? 0, `bucket ${b} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('fixed example: a URL needle absent from a digit-only log is not-found', () => {
    const needle: Needle = { value: 'https://evil.example:8080/x', origin: 'effect', stepIndex: 0 };
    const links = traceRedThread([{ source: 's', kind: 'file', content: '12345\n678' }], [needle]);
    expect(links).toStrictEqual([{ status: 'not-found', needle }]);
  });
});
