// Feature: site-live, Property L7: Settling equals playing through, for every outcome.
// The "fake clock run" is a virtual clock over the timed events of buildScript: every event of step k fires
// at STEP_START[k] + at, in time order (stable), exactly as the walkthrough hook schedules them.
// Generated plan texts run up to TEXT_LIMIT (256) characters: buildScript types a long text faster (typeMs)
// so that step 2 stays inside its slot of the nominal timing table; the checks stay within six rows for the
// same reason.
// Validates: Requirements 7.1, 7.2, 7.6, 7.7, 16.6
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CheckRow, PlanRecord, RunsFile, WorldRecord } from '../../src/data/types';
import { initialState, reduceWalk } from '../../src/engine/reducer';
import { buildScript, settle, STEP_START, TYPE_MS, typeMs } from '../../src/engine/script';
import type { WalkState } from '../../src/engine/types';
import type { Outcome } from '../../src/live/types';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const runs = JSON.parse(readFileSync(resolve(__dirname, '../../src/data/runs.json'), 'utf8')) as RunsFile;
const WORLDS = [runs.worlds.shell, runs.worlds.hand, runs.worlds.cloud];

const verdictArb = fc.constantFrom<PlanRecord['verdict']>('pass', 'warn', 'block');
const checkArb: fc.Arbitrary<CheckRow> = fc.record({
  label: fc.string({ minLength: 1, maxLength: 24 }),
  measured: fc.string({ maxLength: 24 }),
  ok: fc.boolean(),
});
const factsArb: fc.Arbitrary<Record<string, number | string>> = fc.record(
  {
    rowsLost: fc.integer({ min: 0, max: 5000 }),
    removedBuckets: fc.constantFrom('', 'backups', 'backups,logs'),
    successRate: fc.double({ min: 0, max: 1, noNaN: true }),
    extra: fc.string({ maxLength: 12 }),
  },
  { requiredKeys: [] },
);

function planArb(base: PlanRecord): fc.Arbitrary<PlanRecord> {
  return fc
    .tuple(verdictArb, fc.boolean(), fc.array(checkArb, { maxLength: 6 }), factsArb, fc.string({ minLength: 1, maxLength: 256 }))
    .map(([verdict, equal, checks, facts, display]) => ({
      ...base,
      verdict,
      p1: { ...base.p1, equal },
      checks,
      facts,
      display,
      commands: [display],
    }));
}

/** Records of all five Outcomes, over the three worlds. */
const recordArb: fc.Arbitrary<WorldRecord> = fc
  .tuple(fc.constantFrom(...WORLDS), fc.boolean(), fc.boolean())
  .chain(([w, hasFix, unsupported]) => {
    const preset = w.presets[0]!;
    return fc.tuple(planArb(preset.plan), planArb(preset.fixed ?? preset.plan)).map(([plan, fixedPlan]): WorldRecord => {
      const fixed = plan.verdict === 'block' && hasFix ? fixedPlan : null;
      const outcome: Outcome = unsupported
        ? 'unsupported'
        : plan.verdict === 'block'
          ? fixed === null
            ? 'block-open'
            : 'block-fixed'
          : plan.verdict;
      const base: WorldRecord = { id: w.id, ward: w.ward, reality: w.reality, plan, fixed, outcome, source: 'live' };
      return unsupported ? { ...base, unsupported: { reason: 'x', known: ['a'] } } : base;
    });
  });

const stepArb = fc.integer({ min: 0, max: 4 });

/** The state without the fields that settling and playing legitimately set differently. */
function core(s: WalkState): Omit<WalkState, 'narration' | 'term'> & { term: Omit<WalkState['term'], 'typed'> } {
  const { narration: _n, term, ...rest } = s;
  const { typed: _t, ...termRest } = term;
  void _n;
  void _t;
  return { ...rest, term: termRest };
}

/** Folds the events of steps 0 to `n` in `at` order: what `settle` does, written out. */
function fold(record: WorldRecord, n: number): WalkState {
  let s = initialState(record);
  for (let k = 0; k <= n; k++) for (const { event } of buildScript(record, k)) s = reduceWalk(s, event);
  return s;
}

/** Runs a virtual clock over steps 0 to 4 and returns the state once every event of step `n` has fired. */
function playUntilStepEnd(record: WorldRecord, n: number): WalkState {
  const timers: { time: number; seq: number; step: number; event: ReturnType<typeof buildScript>[number]['event'] }[] = [];
  let seq = 0;
  for (let k = 0; k <= 4; k++) {
    for (const { at, event } of buildScript(record, k)) {
      timers.push({ time: (STEP_START[k] ?? 0) + at, seq: seq++, step: k, event });
    }
  }
  timers.sort((a, b) => a.time - b.time || a.seq - b.seq);
  const lastOfStep = Math.max(...timers.filter((t) => t.step <= n).map((t) => t.time));
  let s = initialState(record);
  for (const t of timers) {
    if (t.time > lastOfStep) break;
    s = reduceWalk(s, t.event);
  }
  return s;
}

describe('Property L7: settling equals playing through, for every outcome', () => {
  /** **Validates: Requirements 7.1, 7.2, 7.6, 7.7** */
  it('folding steps 0..n equals the fake-clock state once step n has fired (narration and typed text aside)', () => {
    fc.assert(
      fc.property(recordArb, stepArb, (record, n) => {
        const played = playUntilStepEnd(record, n);
        expect(core(played)).toEqual(core(fold(record, n)));
        expect(core(settle(record, n))).toEqual(core(played));
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  /** **Validates: Requirements 7.1, 7.2** */
  it('no event of a step fires at or after the start of the next step, for texts up to 256 characters', () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        // The Judge step may run its check rows past its slot in the mockup table; the typing step may not.
        const slot = (STEP_START[2] ?? 0) - (STEP_START[1] ?? 0);
        for (const { at } of buildScript(record, 1)) expect(at).toBeLessThan(slot);
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('keeps the verbatim 26 ms per character for every recorded Preset', () => {
    for (const w of WORLDS) {
      for (const p of w.presets) {
        const rec: WorldRecord = { id: w.id, ward: w.ward, reality: w.reality, plan: p.plan, fixed: p.fixed ?? null, outcome: 'block-open', source: 'recorded' };
        expect(typeMs(rec, p.plan.display.length)).toBe(TYPE_MS);
      }
    }
  });

  /** **Validates: Requirements 7.2, 16.6** */
  it('the state after step 4 equals the Reduced_Motion final state, typed text and narration included', () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        expect(settle(record, 4)).toEqual(playUntilStepEnd(record, 4));
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  /** **Validates: Requirements 7.6, 7.7** */
  it('for unsupported every settled state equals the state after step 0', () => {
    fc.assert(
      fc.property(recordArb, stepArb, (record, n) => {
        fc.pre(record.outcome === 'unsupported');
        expect(settle(record, n)).toEqual(settle(record, 0));
        expect(core(playUntilStepEnd(record, 0))).toEqual(core(settle(record, n)));
      }),
      { numRuns: NUM_RUNS, maxSkipsPerRun: 1000 },
    );
  }, PBT_TIMEOUT);
});
