import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';
import { GRAVEYARD_MAX, graveyardReducer, initialGraveyardState } from '../../src/state/graveyard';
import type { GraveyardEvent, GraveyardState } from '../../src/state/graveyard';
import type { Playground_Run } from '../../src/pipeline/run-playground';

type Origin = 'explicit' | 'edit' | 'purify';
type Verdict = 'pass' | 'warn' | 'block';

interface Spec {
  verdict: Verdict;
  origin: Origin | undefined;
  wardIds: string[];
  commands: string[];
}

function makeRun(verdict: Verdict, wardIds: string[]): Playground_Run {
  return {
    report: { snapshots: [], changes: [], effectsOutside: [], observedEvents: [], variantResults: [] },
    wardVerdict: { verdict, violations: wardIds.map((wardId) => ({ wardId })), notices: [] },
    verdict,
    claims: { mode: 'playground', p1Claimed: true, p5Claimed: true, p6Claimed: true },
  } as unknown as Playground_Run;
}

function toEvent(sp: Spec): GraveyardEvent {
  return {
    type: 'add',
    run: makeRun(sp.verdict, sp.wardIds),
    plan: sp.commands.map((command) => ({ command })),
    recordedAt: '2030-01-02T03:04:05Z',
    ...(sp.origin === undefined ? {} : { origin: sp.origin }),
  };
}

const specArb: fc.Arbitrary<Spec> = fc.record({
  verdict: fc.constantFrom<Verdict>('pass', 'warn', 'block', 'block'),
  origin: fc.constantFrom<Origin | undefined>(undefined, 'explicit', 'explicit', 'edit', 'purify'),
  wardIds: fc.array(fc.constantFrom('w-a', 'w-b', 'w-c', 'w-d'), { maxLength: 6 }),
  commands: fc.array(fc.string({ maxLength: 12 }), { minLength: 1, maxLength: 4 }),
});

const isRecorded = (sp: Spec): boolean => sp.verdict === 'block' && (sp.origin === undefined || sp.origin === 'explicit');

function run(specs: readonly Spec[]): GraveyardState {
  return specs.reduce((s, sp) => graveyardReducer(s, toEvent(sp)), initialGraveyardState);
}

function check(specs: readonly Spec[]): void {
  const recorded = specs.filter(isRecorded);
  const s = run(specs);
  const kept = recorded.slice(Math.max(0, recorded.length - GRAVEYARD_MAX));
  expect(s.entries).toHaveLength(kept.length);
  expect(s.entries.length).toBeLessThanOrEqual(GRAVEYARD_MAX);
  expect(s.dropped).toBe(recorded.length > GRAVEYARD_MAX);
  expect(s.nextId).toBe(recorded.length + 1);

  let prev = 0;
  s.entries.forEach((g, i) => {
    const sp = kept[i]!;
    expect(g.id).toMatch(/^g-\d+$/);
    expect(g.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    const n = Number(g.id.slice(2));
    expect(n).toBeGreaterThan(prev);
    prev = n;
    expect(n).toBe(recorded.length - kept.length + i + 1);
    expect(g.wardIds).toEqual([...new Set(sp.wardIds)]);
    expect(g.command).toBe(sp.commands.join('; '));
  });
}

describe('Property 25: Graveyard reducer', () => {
  // **Validates: Requirements 16.6, 17.3, 17.4, 17.5, 17.9**
  it(
    'holds exactly the explicit block runs, capped at 200 with ordered ids',
    () => {
      fc.assert(fc.property(fc.array(specArb, { maxLength: 40 }), check), { numRuns: NUM_RUNS });
    },
    PBT_TIMEOUT,
  );

  it(
    'drops the oldest first past 200 entries and sets the drop flag',
    () => {
      const blockArb = fc.record({
        verdict: fc.constant<Verdict>('block'),
        origin: fc.constantFrom<Origin | undefined>(undefined, 'explicit'),
        wardIds: fc.array(fc.constantFrom('w-a', 'w-b'), { maxLength: 3 }),
        commands: fc.array(fc.string({ maxLength: 6 }), { minLength: 1, maxLength: 2 }),
      });
      fc.assert(
        fc.property(fc.array(blockArb, { minLength: GRAVEYARD_MAX + 1, maxLength: GRAVEYARD_MAX + 20 }), (specs) => {
          check(specs);
          expect(run(specs).dropped).toBe(true);
        }),
        { numRuns: Math.min(NUM_RUNS, 30) },
      );
    },
    PBT_TIMEOUT,
  );

  it('adds no entry for pass, warn, edit-caused, or purify events', () => {
    const none = run([
      { verdict: 'pass', origin: 'explicit', wardIds: [], commands: ['a'] },
      { verdict: 'warn', origin: undefined, wardIds: [], commands: ['a'] },
      { verdict: 'block', origin: 'edit', wardIds: ['w-a'], commands: ['a'] },
      { verdict: 'block', origin: 'purify', wardIds: ['w-a'], commands: ['a'] },
    ]);
    expect(none).toBe(initialGraveyardState);
  });
});
