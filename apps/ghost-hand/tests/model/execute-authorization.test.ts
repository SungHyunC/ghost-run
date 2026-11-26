// Requirement 12.7: a pass authorizes one execution, from the Reference_State and seed it was rehearsed on.
import type { WardVerdict } from '@ghost-run/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GhostRun } from '../../src/pipeline/types.js';
import type { PlanFile } from '../../src/plan/plan-file.js';
import { INITIAL_STATE, canExecuteReference, executeStaleReason, reducer } from '../../src/reducer.js';
import type { AppEvent, AppState } from '../../src/reducer.js';
import { EXECUTE_STALE_ARM_TEXT, EXECUTE_STALE_SEED_TEXT } from '../../src/ui-text.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';

type V = 'pass' | 'block';

function planOf(name: string, force: number): PlanFile {
  return {
    format: 'ghost-hand-plan',
    version: 1,
    name,
    origin: 'scripted',
    actions: [{ type: 'grasp', force }],
    taskText: 't',
  };
}
const PLANS = [planOf('a', 5), planOf('b', 6)] as const;

function runOf(verdict: V): GhostRun {
  const wardVerdict: WardVerdict = { verdict, violations: [], notices: [] };
  return { verdict, wardVerdict, claims: { p1Claimed: true } } as unknown as GhostRun;
}

function play(events: readonly AppEvent[], from: AppState = INITIAL_STATE): AppState {
  return events.reduce(reducer, from);
}
const runPass: AppEvent[] = [
  { type: 'run-started', explicit: true },
  { type: 'run-finished', run: runOf('pass'), nowMs: 0 },
];
const passed = (): AppState => play([{ type: 'plan-loaded', plan: PLANS[0] }, ...runPass]);

describe('a pass authorizes one execution', () => {
  it('enables Execute after a pass and disables it after the arm moved', () => {
    const s = passed();
    expect(canExecuteReference(s)).toBe(true);
    expect(executeStaleReason(s)).toBeNull();
    const moved = reducer(s, { type: 'reference-executed', p2Match: true });
    expect(moved.referenceExecuted).toBe(true);
    expect(canExecuteReference(moved)).toBe(false);
    expect(executeStaleReason(moved)).toBe(EXECUTE_STALE_ARM_TEXT);
    // execute-then-execute: the second event changes nothing but the epoch
    const again = reducer(moved, { type: 'reference-executed', p2Match: true });
    expect(again).toEqual({ ...moved, referenceEpoch: moved.referenceEpoch + 1 });
  });

  it('keeps Execute off when the seed changed during the execution and was changed back', () => {
    const s = passed();
    expect(canExecuteReference(s)).toBe(true);
    // The execution started from the pass; the seed changes while it runs.
    const during = reducer(s, { type: 'seed-changed', seed: 99 });
    const done = reducer(during, { type: 'reference-executed', p2Match: true });
    expect(done.referenceEpoch).toBe(s.referenceEpoch + 1);
    expect(done.referenceExecuted).toBe(false);
    expect(done.p2Match).toBeNull();
    const back = reducer(done, { type: 'seed-changed', seed: INITIAL_STATE.seed });
    expect(canExecuteReference(back)).toBe(false);
    expect(executeStaleReason(back)).toBe(EXECUTE_STALE_ARM_TEXT);
  });

  it('keeps Execute off when the same plan was loaded again during the execution', () => {
    const s = passed();
    const during = reducer(s, { type: 'plan-loaded', plan: PLANS[0] });
    const done = reducer(during, { type: 'reference-executed' });
    expect(canExecuteReference(done)).toBe(false);
    expect(canExecuteReference(reducer(done, { type: 'plan-loaded', plan: PLANS[0] }))).toBe(false);
  });

  it('stays disabled after a reset until a new run passes', () => {
    const moved = reducer(passed(), { type: 'reference-executed' });
    const reset = reducer(moved, { type: 'reference-reset' });
    expect(canExecuteReference(reset)).toBe(false);
    expect(executeStaleReason(reset)).toBe(EXECUTE_STALE_ARM_TEXT);
    expect(canExecuteReference(play(runPass, reset))).toBe(true);
  });

  it('stays disabled after a seed change until a new run passes', () => {
    const changed = reducer(passed(), { type: 'seed-changed', seed: 99 });
    expect(canExecuteReference(changed)).toBe(false);
    expect(executeStaleReason(changed)).toBe(EXECUTE_STALE_SEED_TEXT);
    expect(canExecuteReference(play(runPass, changed))).toBe(true);
    // changing the seed back restores the rehearsed pair
    expect(canExecuteReference(reducer(changed, { type: 'seed-changed', seed: INITIAL_STATE.seed }))).toBe(true);
  });

  it('rejects a pass whose run started before the arm was reset', () => {
    const started = play([{ type: 'plan-loaded', plan: PLANS[0] }, { type: 'run-started', explicit: true }]);
    const s = play([{ type: 'reference-reset' }, { type: 'run-finished', run: runOf('pass'), nowMs: 0 }], started);
    expect(canExecuteReference(s)).toBe(false);
  });

  it('gives no reason without a passing run or while the plan changed', () => {
    expect(executeStaleReason(INITIAL_STATE)).toBeNull();
    expect(executeStaleReason(reducer(passed(), { type: 'plan-loaded', plan: PLANS[1] }))).toBeNull();
  });
});

type Op =
  | { readonly t: 'load'; readonly i: 0 | 1 }
  | { readonly t: 'start' }
  | { readonly t: 'finish'; readonly v: V }
  | { readonly t: 'abort' }
  | { readonly t: 'exec' }
  | { readonly t: 'execBegin' }
  | { readonly t: 'execEnd' }
  | { readonly t: 'reset' }
  | { readonly t: 'seed'; readonly seed: number }
  | { readonly t: 'clear' };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ t: fc.constant('load' as const), i: fc.constantFrom<0 | 1>(0, 1) }),
  fc.constant<Op>({ t: 'start' }),
  fc.record({ t: fc.constant('finish' as const), v: fc.constantFrom<V>('pass', 'block') }),
  fc.constant<Op>({ t: 'abort' }),
  fc.constant<Op>({ t: 'exec' }),
  fc.constant<Op>({ t: 'exec' }),
  fc.constant<Op>({ t: 'execBegin' }),
  fc.constant<Op>({ t: 'execEnd' }),
  fc.constant<Op>({ t: 'execEnd' }),
  fc.constant<Op>({ t: 'reset' }),
  fc.record({ t: fc.constant('seed' as const), seed: fc.integer({ min: 1, max: 3 }) }),
  fc.constant<Op>({ t: 'clear' }),
);

// `execBegin` starts an execution (no event until it completes); `execEnd` completes it, possibly after seed or plan events.
function toEvent(op: Op): AppEvent | null {
  switch (op.t) {
    case 'load':
      return { type: 'plan-loaded', plan: PLANS[op.i] };
    case 'start':
      return { type: 'run-started', explicit: true };
    case 'finish':
      return { type: 'run-finished', run: runOf(op.v), nowMs: 0 };
    case 'abort':
      return { type: 'run-aborted' };
    case 'exec':
    case 'execEnd':
      return { type: 'reference-executed' };
    case 'execBegin':
      return null;
    case 'reset':
      return { type: 'reference-reset' };
    case 'seed':
      return { type: 'seed-changed', seed: op.seed };
    case 'clear':
      return { type: 'plan-cleared' };
  }
}

describe('Property: Execute needs an unused pass rehearsed from the current arm state and seed', () => {
  it('matches an independent model over random event sequences', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        // Model: `arm` counts moves of the reference arm; a run remembers arm, seed and plan at its start.
        let plan: number | null = null;
        let seed = INITIAL_STATE.seed;
        let arm = 0;
        let running: { arm: number; seed: number; plan: number } | null = null;
        let last: { verdict: V; arm: number; seed: number; plan: number; used: boolean } | null = null;
        const enabled = (): boolean =>
          last !== null &&
          last.verdict === 'pass' &&
          !last.used &&
          plan === last.plan &&
          last.arm === arm &&
          last.seed === seed &&
          running === null;
        let state: AppState = INITIAL_STATE;
        let executing = false;
        for (const op of ops) {
          const wasEnabled = enabled();
          if (op.t === 'execBegin') executing = enabled();
          if (op.t === 'execEnd') {
            if (!executing) continue;
            executing = false;
          }
          const event = toEvent(op);
          if (event !== null) state = reducer(state, event);
          switch (op.t) {
            case 'load':
              plan = op.i;
              break;
            case 'start':
              if (plan !== null) running = { arm, seed, plan };
              break;
            case 'finish': {
              const r = running ?? (plan === null ? null : { arm, seed, plan });
              if (r !== null) last = { verdict: op.v, ...r, used: false };
              running = null;
              break;
            }
            case 'abort':
              running = null;
              break;
            case 'exec':
            case 'execEnd':
              // The arm moved whatever else changed meanwhile; only an unchanged pass is used up.
              arm += 1;
              if (wasEnabled && last !== null) last.used = true;
              break;
            case 'reset':
              arm += 1;
              break;
            case 'seed':
              seed = op.seed;
              break;
            case 'clear':
              plan = null;
              break;
          }
          expect(canExecuteReference(state)).toBe(enabled());
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);
});
