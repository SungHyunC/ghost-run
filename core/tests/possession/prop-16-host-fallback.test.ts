// Feature: possession, Property 16: Host fallback follows the boundary and case rules
// **Validates: Requirements 10.7, 10.8**
//
// Scope: supporting property. Claimed everywhere.
// Not claimed: internationalized domain names, userinfo semantics, or DNS equivalence.
// Uses the independent host oracle (refHostOf, refHostIndex, refFirstOccurrence).
// Only reserved domains (.example, .test, .localhost, .invalid) appear.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { traceRedThread } from '../../src/possession/red-thread.js';
import type { Needle, ProvenanceLog, ProvenanceRecord } from '../../src/possession/types.js';
import { createCounter } from '../pbt-stats.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { asciiReporter, refFirstOccurrence, refHostOf, refPosition } from './arbitraries.js';

// -- Generators ---------------------------------------------------------------

const labelArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,6}[a-z0-9]$/);
const tldArb = fc.constantFrom('example', 'test', 'invalid', 'localhost');
const valueArb: fc.Arbitrary<{ value: string; host: string }> = fc
  .tuple(
    fc.constantFrom('https', 'http', 'ftp'),
    labelArb,
    tldArb,
    fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
    fc.option(fc.stringMatching(/^[a-z]{1,6}(\/[a-z]{1,6})?$/), { nil: undefined }),
  )
  .map(([scheme, label, tld, port, rest]) => {
    const host = `${label}.${tld}`;
    return {
      host,
      value: `${scheme}://${host}${port === undefined ? '' : ':' + port}${rest === undefined ? '' : '/' + rest}`,
    };
  });

/** Characters placed directly before and after a host occurrence (boundary and non-boundary). */
const SURROUND: readonly string[] = [
  'a', 'Z', '0', '9', '_', '.', '-', ' ', '/', ':', '@', '#', '=', '(', ')', ',', '\n', '\r', '\t', '"',
];
const surroundArb = fc.constantFrom(...SURROUND);

/** Fixed pieces that never contain the host or the value. */
const FILLER: readonly string[] = ['x', 'see ', 'go to ', '\n', 'q.', '-', '12', 'zz'];

/** Random ASCII case per letter, driven by a mask of booleans. */
function applyCase(host: string, mask: readonly boolean[]): string {
  return Array.from(host, (ch, i) => (mask[i % mask.length] ? ch.toUpperCase() : ch.toLowerCase())).join('');
}

const maskArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 8 });

interface Case {
  readonly value: string;
  readonly host: string;
  readonly log: ProvenanceLog;
}

const pieceArb = (host: string): fc.Arbitrary<string> =>
  fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom(...FILLER) },
    {
      weight: 4,
      arbitrary: fc
        .tuple(fc.option(surroundArb, { nil: '' }), maskArb, fc.option(surroundArb, { nil: '' }))
        .map(([before, mask, after]) => before + applyCase(host, mask) + after),
    },
  );

const caseArb: fc.Arbitrary<Case> = valueArb.chain(({ value, host }) =>
  fc
    .array(
      fc.array(pieceArb(host), { maxLength: 6 }).map((ps) => ps.join('')),
      { maxLength: 4 },
    )
    .map((contents) => ({
      value,
      host,
      log: contents.map((content) => ({ source: 'doc.md', kind: 'file' as const, content })),
    }))
    .filter((c) => c.log.every((r) => !r.content.includes(c.value))),
);

const needleOf = (value: string): Needle => ({ value, origin: 'effect', stepIndex: 0 });

// -- Tests --------------------------------------------------------------------

describe('Property 16: Host fallback follows the boundary and case rules', () => {
  it(
    'found with matchedKey host iff some occurrence satisfies the boundary rule, at the first such occurrence',
    () => {
      const counter = createCounter('P16 buckets');
      let runs = 0;
      fc.assert(
        fc.property(caseArb, ({ value, host, log }) => {
          runs++;
          expect(refHostOf(value)).toBe(host);
          const [link] = traceRedThread(log, [needleOf(value)]);
          const expected = refFirstOccurrence(value, log);
          const anyCaseInsensitive = log.some((r) => r.content.toLowerCase().includes(host));

          if (expected === undefined) {
            expect(link).toStrictEqual({ status: 'not-found', needle: needleOf(value) });
            counter.add(anyCaseInsensitive ? 'rejected-by-boundary' : 'no-occurrence');
            return;
          }
          expect(expected.matchedKey).toBe('host');
          expect(link?.status).toBe('found');
          if (link?.status !== 'found') return;
          expect(link.matchedKey).toBe('host');
          expect(link.recordIndex).toBe(expected.recordIndex);
          const content = (log[expected.recordIndex] as { content: string }).content;
          const pos = refPosition(content, expected.index);
          expect(link.line).toBe(pos.line);
          expect(link.column).toBe(pos.column);
          expect(link.hidden).toBe(false);
          counter.add('accepted');
          const matched = content.slice(expected.index, expected.index + host.length);
          if (matched !== host) counter.add('accepted-mixed-case');
          if (expected.recordIndex > 0) counter.add('accepted-in-later-record');
          if (expected.index > 0) counter.add('accepted-after-prefix');
          if (anyCaseInsensitive && log.some((r) => r.content.includes(host) && r.content !== content)) {
            counter.add('multiple-records-with-host');
          }
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P16a runs=${runs} (NUM_RUNS=${NUM_RUNS}) ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const b of [
        'accepted',
        'accepted-mixed-case',
        'accepted-in-later-record',
        'accepted-after-prefix',
        'rejected-by-boundary',
        'no-occurrence',
      ]) {
        expect(counter.counts[b] ?? 0, `bucket ${b} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it(
    'when the full value occurs, matchedKey is value and the host is not consulted',
    () => {
      const counter = createCounter('P16 value buckets');
      let runs = 0;
      fc.assert(
        fc.property(
          caseArb,
          fc.nat(),
          fc.constantFrom('', ' ', '\n', 'x'),
          fc.constantFrom('', ' ', '\n', 'x'),
          (c, pick, pre, post) => {
            runs++;
            // Put the full value into a chosen record (or a new last record); earlier
            // records may hold host occurrences that would match by the host rule.
            const log: ProvenanceRecord[] = c.log.map((r) => ({ ...r }));
            const at = pick % (log.length + 1);
            const planted = { source: 'doc.md', kind: 'file' as const, content: pre + c.value + post };
            log.splice(at, 0, planted);
            const [link] = traceRedThread(log, [needleOf(c.value)]);
            const expected = refFirstOccurrence(c.value, log);
            expect(expected?.matchedKey).toBe('value');
            expect(link?.status).toBe('found');
            if (link?.status !== 'found') return;
            expect(link.matchedKey).toBe('value');
            expect(link.recordIndex).toBe(at);
            const pos = refPosition(planted.content, pre.length);
            expect(link.line).toBe(pos.line);
            expect(link.column).toBe(pos.column);
            counter.add('value-found');
            if (at > 0) counter.add('value-after-earlier-records');
            if (log.slice(0, at).some((r) => r.content.toLowerCase().includes(c.host))) {
              counter.add('earlier-host-occurrence-ignored');
            }
          },
        ),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P16b runs=${runs} (NUM_RUNS=${NUM_RUNS}) ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const b of ['value-found', 'value-after-earlier-records', 'earlier-host-occurrence-ignored']) {
        expect(counter.counts[b] ?? 0, `bucket ${b} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('fixed example: boundary and case rules on one reserved host', () => {
    const needle = needleOf('https://evil.example:8080/x');
    const log: ProvenanceLog = [
      { source: 'a', kind: 'file', content: 'notevil.example evil.examples evil.example-x' },
      { source: 'b', kind: 'web', content: 'see EVIL.Example, then' },
    ];
    const [link] = traceRedThread(log, [needle]);
    expect(link).toMatchObject({ status: 'found', matchedKey: 'host', recordIndex: 1, line: 1, column: 5 });
  });

  it('fixed example: a dot before the host and a dot after it', () => {
    const needle = needleOf('http://a.test/p');
    const [before] = traceRedThread([{ source: 's', kind: 'file', content: 'x.a.test' }], [needle]);
    expect(before?.status).toBe('not-found');
    const [after] = traceRedThread([{ source: 's', kind: 'file', content: 'a.test.' }], [needle]);
    expect(after).toMatchObject({ status: 'found', matchedKey: 'host', column: 1 });
  });
});
