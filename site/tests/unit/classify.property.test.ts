// Property L8: Outcome classification and no invented fix.
// The input space of the answers is small and enumerated by the generators below: a first answer of
// five kinds (ran with each verdict, unsupported, rejected with each problem) and a Fixed_Plan answer of
// the same kinds plus failed and none.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PlanRecord, RunsFile, WorldRecord } from '../../src/data/types';
import { settle } from '../../src/engine/script';
import { classify, toWalkRecord } from '../../src/live/classify';
import type { LiveAnswer, LiveRun, Outcome } from '../../src/live/types';

const runs = JSON.parse(readFileSync(resolve(__dirname, '../../src/data/runs.json'), 'utf8')) as RunsFile;
const WORLDS = [runs.worlds.shell, runs.worlds.hand, runs.worlds.cloud];

const verdictArb = fc.constantFrom<PlanRecord['verdict']>('pass', 'warn', 'block');
const worldArb = fc.constantFrom(...WORLDS);

function withPlan(plan: PlanRecord, verdict: PlanRecord['verdict'], equal: boolean): PlanRecord {
  return { ...plan, verdict, p1: { ...plan.p1, equal } };
}

const ranArb: fc.Arbitrary<LiveAnswer> = fc
  .tuple(worldArb, verdictArb, fc.boolean())
  .map(([w, verdict, equal]) => ({
    status: 'ran' as const,
    run: { world: w.id, ward: w.ward, reality: w.reality, plan: withPlan(w.presets[0]!.plan, verdict, equal) },
  }));

const notRanArb: fc.Arbitrary<LiveAnswer> = fc.oneof(
  fc.constant<LiveAnswer>({ status: 'unsupported', reason: 'x', stepIndexes: [0] }),
  fc.constantFrom<'empty' | 'too-long' | 'invalid-character' | 'out-of-range'>(
    'empty',
    'too-long',
    'invalid-character',
    'out-of-range',
  ).map((problem): LiveAnswer => ({ status: 'rejected', problem })),
);

const firstArb = fc.oneof(ranArb, notRanArb);
const fixedArb: fc.Arbitrary<LiveAnswer | null> = fc.oneof(
  ranArb,
  notRanArb,
  fc.constant<LiveAnswer | null>(null),
  fc.constantFrom<'load' | 'run' | 'timeout' | 'internal'>('load', 'run', 'timeout', 'internal').map(
    (cause): LiveAnswer => ({ status: 'failed', cause }),
  ),
);

function expected(first: LiveAnswer, fixed: LiveAnswer | null): Outcome {
  if (first.status !== 'ran') return 'unsupported';
  const v = first.run.plan.verdict;
  if (v === 'pass') return 'pass';
  if (v === 'warn') return 'warn';
  return fixed !== null && fixed.status === 'ran' ? 'block-fixed' : 'block-open';
}

function asRun(a: LiveAnswer): LiveRun {
  if (a.status !== 'ran') throw new Error('not ran');
  return a.run;
}

describe('Property L8: classification', () => {
  /** **Validates: Requirements 7.4, 8.3, 8.4** */
  it('classify follows the rules for any pair of answers', () => {
    fc.assert(
      fc.property(firstArb, fixedArb, (first, fixed) => {
        expect(classify(first, fixed)).toBe(expected(first, fixed));
      }),
      { numRuns: 200 },
    );
  });

  /** **Validates: Requirements 8.3, 8.4** */
  it('never invents a fix: without a Fixed_Plan the Outcome is not block-fixed and the record has fixed null', () => {
    fc.assert(
      fc.property(firstArb, (first) => {
        const outcome = classify(first, null);
        expect(outcome).not.toBe('block-fixed');
        if (first.status === 'ran') {
          const record = toWalkRecord(asRun(first), null, outcome, 'live');
          expect(record.fixed).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 8.3, 8.4** */
  it('a block-fixed record carries exactly the Fixed_Plan that ran', () => {
    fc.assert(
      fc.property(ranArb, ranArb, (first, fixed) => {
        const firstBlocked = { status: 'ran' as const, run: { ...asRun(first), plan: withPlan(asRun(first).plan, 'block', true) } };
        const outcome = classify(firstBlocked, fixed);
        expect(outcome).toBe('block-fixed');
        const record = toWalkRecord(firstBlocked.run, asRun(fixed), outcome, 'live');
        expect(record.fixed).toBe(asRun(fixed).plan);
      }),
      { numRuns: 50 },
    );
  });
});

// Badge rules on the settled state of generated records, for all five Outcomes.
describe('Property L8: badge rules on the settled state', () => {
  const recordArb: fc.Arbitrary<WorldRecord> = fc
    .tuple(worldArb, verdictArb, fc.boolean(), verdictArb, fc.boolean(), fc.boolean(), fc.boolean())
    .map(([w, v1, e1, v2, e2, hasFix, unsupported]) => {
      const preset = w.presets[0]!;
      const plan = withPlan(preset.plan, v1, e1);
      const fixed = v1 === 'block' && hasFix ? withPlan(preset.fixed ?? preset.plan, v2, e2) : null;
      const outcome: Outcome = unsupported ? 'unsupported' : v1 === 'block' ? (fixed === null ? 'block-open' : 'block-fixed') : v1;
      const base: WorldRecord = { id: w.id, ward: w.ward, reality: w.reality, plan, fixed, outcome, source: 'live' };
      return unsupported ? { ...base, unsupported: { reason: 'x', known: ['a'] } } : base;
    });

  /** The verdict that decides the end of the run: the fixed run for block-fixed, else the first run. */
  function final(record: WorldRecord): PlanRecord {
    return record.outcome === 'block-fixed' && record.fixed !== null ? record.fixed : record.plan;
  }

  /** **Validates: Requirements 7.5, 7.6, 8.4** */
  it('the go badge shows only at step 5, with a final pass and p1.equal; never both badges', () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        for (const step of [0, 1, 2, 3, 4]) {
          const { badges } = settle(record, step);
          expect(badges.go && badges.fingerprint).toBe(false);
          if (record.outcome === 'unsupported') continue;
          if (step < 4) expect(badges.go).toBe(false);
          else expect(badges.go).toBe(final(record).verdict === 'pass' && final(record).p1.equal);
        }
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 7.5, 7.7** */
  it('unsupported: no badge in any settled state, and every state equals the state after step 1', () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        fc.pre(record.outcome === 'unsupported');
        const first = settle(record, 0);
        expect(first.disabledSteps).toBe(4);
        for (const step of [0, 1, 2, 3, 4]) {
          const state = settle(record, step);
          expect(state.badges).toEqual({ fingerprint: false, go: false });
          expect(state).toEqual(first);
        }
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 7.5** */
  it('pass and warn at step 4 show the fingerprint badge exactly when p1.equal, and no go badge', () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        fc.pre(record.outcome === 'pass' || record.outcome === 'warn');
        const { badges } = settle(record, 3);
        expect(badges.fingerprint).toBe(record.plan.p1.equal);
        expect(badges.go).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 7.5, 7.6** */
  it('the go badge at step 5 reads the fixed run for block-fixed and the first run for pass', () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        fc.pre(record.outcome === 'pass' || record.outcome === 'block-fixed');
        const f = final(record);
        expect(settle(record, 4).badges).toEqual({ fingerprint: false, go: f.verdict === 'pass' && f.p1.equal });
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 7.5, 7.6** */
  it('the go badge is never set when the final verdict is warn or block', () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        fc.pre(final(record).verdict !== 'pass');
        expect(settle(record, 4).badges.go).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
