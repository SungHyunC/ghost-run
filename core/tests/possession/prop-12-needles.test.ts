// Feature: possession, Property 12: Needle collection is complete, ordered, and non-destructive
// **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**
//
// Scope: supporting property (red thread input). Claimed everywhere.
// Not claimed: correctness of the report itself.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { collectNeedles } from '../../src/possession/red-thread.js';
import type { Needle, NeedleOrigin, NeedleSource } from '../../src/possession/types.js';
import { createCounter } from '../pbt-stats.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { asciiReporter } from './arbitraries.js';

// Values: small pool (forces duplicates), empty string, and arbitrary strings.
const POOL = ['a.example', 'b.test', '/etc/x', 'https://c.invalid/p', 'caf\u00e9', '\ud83d\ude00'];
const valueArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...POOL) },
  { weight: 2, arbitrary: fc.constant('') },
  { weight: 2, arbitrary: fc.string({ maxLength: 12 }) },
);
const optValueArb: fc.Arbitrary<string | undefined> = fc.oneof(
  { weight: 3, arbitrary: valueArb },
  { weight: 1, arbitrary: fc.constant(undefined) },
);

// fc.record builds null-prototype objects; spread into plain objects so structuredClone compares equal.
const effectArb = fc
  .record({ kind: fc.constantFrom('net', 'db'), destination: valueArb })
  .map((e) => ({ ...e }));

// Event fields are built as plain literals; undefined fields are present-but-undefined or absent.
const eventArb = fc
  .tuple(
    fc.constantFrom<'network-attempt' | 'secret-read'>('network-attempt', 'secret-read'),
    optValueArb,
    optValueArb,
    fc.integer({ min: 0, max: 5 }),
    fc.boolean(),
  )
  .map(([kind, destination, path, stepIndex, explicitUndefined]) => {
    const e: {
      kind: 'network-attempt' | 'secret-read';
      destination?: string | undefined;
      path?: string | undefined;
      stepIndex: number;
    } = { kind, stepIndex };
    if (destination !== undefined || explicitUndefined) e.destination = destination;
    if (path !== undefined || explicitUndefined) e.path = path;
    return e;
  });

const reportArb = fc
  .record({
    effectsOutside: fc.array(fc.array(effectArb, { maxLength: 4 }), { maxLength: 6 }),
    observedEvents: fc.array(eventArb, { maxLength: 8 }),
  })
  .map((r) => ({ ...r }));

const RANK: Record<NeedleOrigin, number> = { effect: 0, 'observed-destination': 1, 'observed-path': 2 };

/** Independent oracle: concatenate in natural order, then stable-sort by (stepIndex, origin rank). */
function expected(report: NeedleSource): Needle[] {
  const all: Needle[] = [];
  report.effectsOutside.forEach((effects, stepIndex) => {
    for (const ef of effects) {
      if (ef.destination !== '') all.push({ value: ef.destination, origin: 'effect', stepIndex });
    }
  });
  for (const ev of report.observedEvents) {
    if (ev.destination !== undefined && ev.destination !== '') {
      all.push({ value: ev.destination, origin: 'observed-destination', stepIndex: ev.stepIndex });
    }
    if (ev.path !== undefined && ev.path !== '') {
      all.push({ value: ev.path, origin: 'observed-path', stepIndex: ev.stepIndex });
    }
  }
  return all
    .map((n, i) => ({ n, i }))
    .sort((a, b) => a.n.stepIndex - b.n.stepIndex || RANK[a.n.origin] - RANK[b.n.origin] || a.i - b.i)
    .map((x) => x.n);
}

function deepCopy<T>(o: T): T {
  return structuredClone(o);
}

describe('Property 12: Needle collection is complete, ordered, and non-destructive', () => {
  it(
    'collectNeedles returns one ordered Needle per non-empty destination/path, keeps duplicates, and does not modify the report',
    () => {
      const counter = createCounter('P12 buckets');
      let runs = 0;
      fc.assert(
        fc.property(reportArb, (report) => {
          runs++;
          const before = deepCopy(report);
          const first = collectNeedles(report);
          const second = collectNeedles(report);

          expect(report).toStrictEqual(before);
          expect(second).toStrictEqual(first);
          expect(first).toStrictEqual(expected(report));

          counter.add(first.length === 0 ? 'no-needles' : 'has-needles');
          if (report.effectsOutside.some((s) => s.some((e) => e.destination === ''))) {
            counter.add('empty-effect-destination');
          }
          if (report.observedEvents.some((e) => e.destination === '' || e.path === '')) {
            counter.add('empty-event-field');
          }
          if (report.observedEvents.some((e) => e.destination === undefined || e.path === undefined)) {
            counter.add('undefined-event-field');
          }
          if (report.observedEvents.some((e) => e.destination !== undefined && e.destination !== '' && e.path !== undefined && e.path !== '')) {
            counter.add('event-with-both');
          }
          if (new Set(first.map((n) => n.value)).size < first.length) counter.add('duplicate-values');
          for (const o of new Set(first.map((n) => n.origin))) counter.add('origin=' + o);
          if (new Set(first.map((n) => n.stepIndex)).size > 1) counter.add('multi-step');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P12 runs=${runs} (NUM_RUNS=${NUM_RUNS}) ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const bucket of [
        'no-needles',
        'has-needles',
        'empty-effect-destination',
        'empty-event-field',
        'undefined-event-field',
        'event-with-both',
        'duplicate-values',
        'origin=effect',
        'origin=observed-destination',
        'origin=observed-path',
        'multi-step',
      ]) {
        expect(counter.counts[bucket] ?? 0, `bucket ${bucket} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('orders a fixed example by step, origin, then array order and keeps duplicates', () => {
    const report: NeedleSource = {
      effectsOutside: [[{ kind: 'net', destination: 'x.example' }], [{ kind: 'net', destination: 'x.example' }]],
      observedEvents: [
        { kind: 'network-attempt', destination: 'x.example', path: '/p', stepIndex: 1 },
        { kind: 'secret-read', path: '', stepIndex: 0 },
      ],
    };
    expect(collectNeedles(report).map((n) => `${n.stepIndex}:${n.origin}:${n.value}`)).toEqual([
      '0:effect:x.example',
      '1:effect:x.example',
      '1:observed-destination:x.example',
      '1:observed-path:/p',
    ]);
  });
});
