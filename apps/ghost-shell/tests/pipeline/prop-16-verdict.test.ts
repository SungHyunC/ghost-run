import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { VERDICT_ORDER, WardEngine } from '@ghost-run/core';
import type { Change, GhostReport, ObservedEvent, Verdict, WardNotice, WardSet, WardVerdict } from '@ghost-run/core';
import { parseWards } from '@ghost-run/wards-config';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';
import { UNSUPPORTED_STEP_REASON, WATCHDOG_STEP_REASON } from '../../src/texts';
import { buildShownVerdict, maxVerdict, verdictFloor } from '../../src/pipeline/verdict';
import type { FloorStep } from '../../src/pipeline/verdict';
import { deriveClaims } from '../../src/pipeline/claims';

const verdictArb: fc.Arbitrary<Verdict> = fc.constantFrom<Verdict>('pass', 'warn', 'block');

const engineNoticeArb: fc.Arbitrary<WardNotice> = fc.record({
  kind: fc.constantFrom<WardNotice['kind']>('effect-outside', 'observed-event', 'content-inspection', 'path-escape'),
  reason: fc.stringMatching(/^[a-z ]{0,12}$/),
  stepIndex: fc.nat({ max: 20 }),
});

const engineVerdictArb: fc.Arbitrary<WardVerdict> = fc.record({
  verdict: verdictArb,
  violations: fc.array(
    fc.record({
      wardId: fc.constantFrom('protect-data', 'no-data-loss', 'no-secret-egress'),
      wardKind: fc.constantFrom<'path' | 'sql' | 'egress'>('path', 'sql', 'egress'),
      reason: fc.stringMatching(/^[a-z ]{0,12}$/),
    }),
    { maxLength: 3 },
  ),
  notices: fc.array(engineNoticeArb, { maxLength: 4 }),
});

/** Steps with distinct stepIndex values, in shuffled order. */
const stepsArb: fc.Arbitrary<FloorStep[]> = fc
  .uniqueArray(fc.nat({ max: 49 }), { maxLength: 12 })
  .chain((idx) =>
    fc.tuple(
      fc.constant(idx),
      fc.array(fc.record({ unsupported: fc.boolean(), watchdog: fc.boolean() }), {
        minLength: idx.length,
        maxLength: idx.length,
      }),
    ),
  )
  .map(([idx, flags]) => idx.map((stepIndex, i) => ({ stepIndex, ...flags[i]! })));

const reasonOf = (s: FloorStep): string[] => [
  ...(s.unsupported ? [UNSUPPORTED_STEP_REASON] : []),
  ...(s.watchdog ? [WATCHDOG_STEP_REASON] : []),
];

describe('Property 16: Verdict floor and engine parity', () => {
  it(
    'shown verdict is max(engine, floor), pass only if both pass, notices ordered',
    () => {
      // Feature: ghost-shell, Property 16: Verdict floor and engine parity
      // **Validates: Requirements 6.4, 8.5, 8.6, 8.7, 15.5**
      fc.assert(
        fc.property(engineVerdictArb, stepsArb, fc.boolean(), (engine, steps, p1Failed) => {
          const floor = verdictFloor(p1Failed, steps);
          const anyStep = steps.some((s) => s.unsupported || s.watchdog);
          expect(floor).toBe(p1Failed ? 'block' : anyStep ? 'warn' : 'pass');

          const shown = buildShownVerdict(engine, p1Failed, steps);
          const expected = VERDICT_ORDER[engine.verdict] >= VERDICT_ORDER[floor] ? engine.verdict : floor;
          expect(shown.verdict).toBe(expected);
          expect(shown.verdict).toBe(maxVerdict(engine.verdict, floor));
          expect(shown.verdict === 'pass').toBe(engine.verdict === 'pass' && floor === 'pass');

          expect(shown.violations).toEqual(engine.violations);
          expect(shown.notices.slice(0, engine.notices.length)).toEqual(engine.notices);
          const added = shown.notices.slice(engine.notices.length);
          const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
          expect(added.every((n) => n.kind === 'unsupported-step')).toBe(true);
          expect(added.map((n) => n.stepIndex)).toEqual(
            ordered.flatMap((s) => reasonOf(s).map(() => s.stepIndex)),
          );
          expect(added.map((n) => n.reason)).toEqual(ordered.flatMap(reasonOf));

          // Claims consequence of the same inputs: a floor of warn or block drops P5 and P6.
          const unsupported = steps.filter((s) => s.unsupported).map((s) => s.stepIndex);
          const { claims } = deriveClaims({
            p1Failed,
            unsupportedSteps: unsupported,
            watchdogFired: steps.some((s) => s.watchdog),
            readCoverage: 'complete',
          });
          expect(claims.p5Claimed).toBe(floor === 'pass');
          expect(claims.p6Claimed).toBe(floor === 'pass');
          expect(claims.p1Claimed).toBe(!p1Failed);
        }),
        { numRuns: NUM_RUNS, verbose: 1 },
      );
    },
    PBT_TIMEOUT,
  );

  const defaultWards = parseWards(readFileSync(resolve(__dirname, '../../wards.yaml'), 'utf8'));
  if (!defaultWards.ok) throw new Error('default wards file does not parse');
  const wardSet: WardSet = defaultWards.wardSet;

  const pathArb = fc.constantFrom('data/a.txt', 'data/x/y.csv', 'db/app.sqlite', '.env', 'src/index.js', 'README.md', 'tmp/z');
  const changeArb: fc.Arbitrary<Change> = fc.oneof(
    fc.record({
      kind: fc.constantFrom('file-created', 'file-overwritten', 'file-deleted'),
      path: pathArb,
    }),
    fc
      .record({
        kind: fc.constant('sql-row-count'),
        table: fc.constantFrom('users', 'orders', 'logs'),
        rowsBefore: fc.nat({ max: 20 }),
        rowsAfter: fc.nat({ max: 20 }),
      })
      .map((c) => ({ ...c })),
  );
  const eventArb: fc.Arbitrary<ObservedEvent> = fc.oneof(
    fc.record({
      kind: fc.constant<'network-attempt'>('network-attempt'),
      destination: fc.constantFrom('registry.npmjs.org:443', 'evil.example:443', 'api.test:80', '192.0.2.7:443'),
      stepIndex: fc.nat({ max: 5 }),
    }),
    fc.record({
      kind: fc.constant<'secret-read'>('secret-read'),
      path: fc.constantFrom('.env', 'keys/server.pem'),
      stepIndex: fc.nat({ max: 5 }),
    }),
  );
  const reportArb: fc.Arbitrary<GhostReport<unknown>> = fc.record({
    snapshots: fc.constant([]),
    changes: fc.array(fc.array(changeArb, { maxLength: 3 }), { maxLength: 6 }),
    effectsOutside: fc.constant([]),
    observedEvents: fc.array(eventArb, { maxLength: 5 }),
    variantResults: fc.constant([]),
  });

  it(
    'with no floor the shown verdict equals WardEngine.evaluate; with a floor it is the max',
    () => {
      // Feature: ghost-shell, Property 16: Verdict floor and engine parity
      // **Validates: Requirements 6.4, 8.5, 8.6, 8.7, 15.5**
      fc.assert(
        fc.property(reportArb, stepsArb, fc.boolean(), (report, steps, p1Failed) => {
          const engine = WardEngine.evaluate(report, wardSet, { secretValues: new Map() });
          const noFloor = buildShownVerdict(engine, false, []);
          expect(noFloor).toEqual(engine);

          const shown = buildShownVerdict(engine, p1Failed, steps);
          expect(shown.verdict).toBe(maxVerdict(engine.verdict, verdictFloor(p1Failed, steps)));
          expect(shown.violations).toEqual(engine.violations);
          expect(shown.notices.slice(0, engine.notices.length)).toEqual(engine.notices);
        }),
        { numRuns: NUM_RUNS, verbose: 1 },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: unsupported step lifts pass to warn; failed fingerprint lifts warn to block', () => {
    const pass: WardVerdict = { verdict: 'pass', violations: [], notices: [] };
    const step: FloorStep = { stepIndex: 2, unsupported: true, watchdog: false };
    const warn = buildShownVerdict(pass, false, [step]);
    expect(warn.verdict).toBe('warn');
    expect(warn.notices).toEqual([{ kind: 'unsupported-step', stepIndex: 2, reason: UNSUPPORTED_STEP_REASON }]);
    expect(buildShownVerdict(warn, true, [step]).verdict).toBe('block');
  });
});
