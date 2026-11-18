// Feature: ghost-hand, Property 23: The graveyard keeps the newest 200 entries
// **Validates: Requirements 14.4, 14.5, 14.9**
import type { WardVerdict } from '@ghost-run/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GhostRun } from '../../src/pipeline/types.js';
import type { PlanFile } from '../../src/plan/plan-file.js';
import { INITIAL_STATE, MAX_GRAVE_ENTRIES, reducer } from '../../src/reducer.js';
import type { AppEvent, AppState } from '../../src/reducer.js';
import { GRAVEYARD_DROP_TEXT } from '../../src/texts.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';

type V = 'pass' | 'warn' | 'block';
interface Op {
  readonly verdict: V;
  readonly explicit: boolean;
  readonly nowMs: number;
}

const PLAN: PlanFile = {
  format: 'ghost-hand-plan',
  version: 1,
  name: 'p23',
  origin: 'scripted',
  actions: [{ type: 'grasp', force: 5 }],
  taskText: 'SECRET-TASK-TEXT',
};

function runOf(verdict: V): GhostRun {
  const wardVerdict: WardVerdict = {
    verdict,
    violations:
      verdict === 'block' ? [{ wardId: 'w-1', wardKind: 'physics', reason: 'too much' }] : [],
    notices: [],
  };
  // Only the fields the reducer reads are populated; the rest is irrelevant to this property.
  return { verdict, wardVerdict, claims: { p1Claimed: true } } as unknown as GhostRun;
}

function start(): AppState {
  return reducer(INITIAL_STATE, { type: 'plan-loaded', plan: PLAN });
}

function apply(state: AppState, op: Op): AppState {
  const started: AppEvent = { type: 'run-started', explicit: op.explicit };
  const s1 = reducer(state, started);
  return reducer(s1, { type: 'run-finished', run: runOf(op.verdict), nowMs: op.nowMs });
}

const nowArb = fc.integer({ min: 0, max: 4_000_000_000_000 });
const verdictArb = fc.constantFrom<V>('pass', 'warn', 'block');
const mixedOpArb: fc.Arbitrary<Op> = fc.record({
  verdict: verdictArb,
  explicit: fc.boolean(),
  nowMs: nowArb,
});
const blockedOpArb: fc.Arbitrary<Op> = fc.record({
  verdict: fc.constant<V>('block'),
  explicit: fc.constant(true),
  nowMs: nowArb,
});

/** 195-210 blocked explicit runs, with a few non-counting runs mixed in. */
const capSeqArb: fc.Arbitrary<Op[]> = fc
  .tuple(
    fc.array(blockedOpArb, { minLength: 195, maxLength: 210 }),
    fc.array(mixedOpArb, { maxLength: 10 }),
  )
  .map(([blocked, noise]) => {
    const out: Op[] = [];
    const every = Math.max(1, Math.floor(blocked.length / (noise.length + 1)));
    let n = 0;
    blocked.forEach((b, i) => {
      out.push(b);
      if (i % every === 0 && n < noise.length) {
        const x = noise[n++]!;
        out.push(x.verdict === 'block' && x.explicit ? { ...x, explicit: false } : x);
      }
    });
    return out;
  });

const mixedSeqArb = fc.array(mixedOpArb, { maxLength: 60 });

function checkSequence(ops: readonly Op[]): void {
  let s = start();
  let counted = 0;
  for (const op of ops) {
    const before = s;
    s = apply(s, op);
    const counts = op.explicit && op.verdict === 'block';
    if (counts) counted++;
    else expect(s.graveyard).toBe(before.graveyard);
    expect(s.graveyard.length).toBe(Math.min(counted, MAX_GRAVE_ENTRIES));
    expect(s.graveyard.length).toBeLessThanOrEqual(MAX_GRAVE_ENTRIES);
  }
  // ids are consecutive, newest last, no gaps; oldest ones dropped first.
  const expectedIds = s.graveyard.map((_, i) => `g-${counted - s.graveyard.length + i + 1}`);
  expect(s.graveyard.map((e) => e.id)).toEqual(expectedIds);
  expect(s.graveDropped).toBe(counted > MAX_GRAVE_ENTRIES);
}

describe('Property 23: The graveyard keeps the newest 200 entries', () => {
  it(
    'Property 23: mixed run sequences record one entry per blocked explicit run',
    () => {
      fc.assert(
        fc.property(mixedSeqArb, (ops) => {
          checkSequence(ops);
        }),
        { numRuns: NUM_RUNS, verbose: 1 },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'Property 23: sequences with 195-210 blocked runs cap at 200 and drop the oldest',
    () => {
      fc.assert(
        fc.property(capSeqArb, (ops) => {
          checkSequence(ops);
        }),
        { numRuns: NUM_RUNS, verbose: 1 },
      );
    },
    PBT_TIMEOUT,
  );
});

describe('Property 23 examples', () => {
  const blocked = (nowMs = 0): Op => ({ verdict: 'block', explicit: true, nowMs });

  it('exactly 200 blocked runs: 200 entries and no drop flag', () => {
    let s = start();
    for (let i = 0; i < 200; i++) s = apply(s, blocked());
    expect(s.graveyard).toHaveLength(200);
    expect(s.graveDropped).toBe(false);
    expect(s.graveyard[0]!.id).toBe('g-1');
    expect(s.graveyard[199]!.id).toBe('g-200');
  });

  it('the 201st blocked run drops g-1 and sets the drop flag', () => {
    let s = start();
    for (let i = 0; i < 201; i++) s = apply(s, blocked());
    expect(s.graveyard).toHaveLength(200);
    expect(s.graveDropped).toBe(true);
    expect(s.graveyard[0]!.id).toBe('g-2');
    expect(s.graveyard[199]!.id).toBe('g-201');
    expect(s.graveyard.some((e) => e.id === 'g-1')).toBe(false);
    expect(GRAVEYARD_DROP_TEXT).toBe('Oldest blocked command dropped (limit 200).');
  });

  it('recordedAt is ISO 8601 UTC without milliseconds', () => {
    const s = apply(start(), blocked(1_700_000_123_456));
    expect(s.graveyard[0]!.recordedAt).toBe('2023-11-14T22:15:23Z');
    expect(s.graveyard[0]!.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('entries hold no trajectory data or taskText', () => {
    const s = apply(start(), blocked());
    const json = JSON.stringify(s.graveyard[0]);
    expect(json).not.toContain('SECRET-TASK-TEXT');
    expect(json).not.toMatch(/taskText|frames|trajectory|overlay/);
  });

  it('non-explicit blocked runs and explicit non-blocked runs record nothing', () => {
    let s = start();
    s = apply(s, { verdict: 'block', explicit: false, nowMs: 0 });
    s = apply(s, { verdict: 'warn', explicit: true, nowMs: 0 });
    s = apply(s, { verdict: 'pass', explicit: true, nowMs: 0 });
    expect(s.graveyard).toHaveLength(0);
    expect(s.graveDropped).toBe(false);
  });
});
