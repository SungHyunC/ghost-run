// Task 14.2: scenarios, the reference execution helpers, and the diff comparison (real MuJoCo, Node).
import { readFileSync } from 'node:fs';
import { parseWards } from '@ghost-run/wards-config';
import { createGhostHandWorld, parseVariantConfig } from '@ghost-run/drawer-arm';
import type { GhostHandWorld } from '@ghost-run/drawer-arm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { probeCapabilities } from '../../src/capabilities';
import { createInlineExecutor } from '../../src/exec/inline';
import { runGhostHand } from '../../src/pipeline/run';
import { parsePlanFile } from '../../src/plan/plan-file';
import type { PlanFile } from '../../src/plan/plan-file';
import { INITIAL_STATE, canExecuteReference, reducer } from '../../src/reducer';
import type { AppEvent, AppState } from '../../src/reducer';
import { FIRST_SCENARIO, REVISED_SCENARIO } from '../../src/plan/scenarios';
import {
  deepEqual,
  diffsMatch,
  drawerDisplacementOf,
  p2CheckLines,
  referenceOverlayInput,
} from '../../src/reference';
import { P2_CHECK_SCOPE_TEXT, P2_MATCH_TEXT, P2_MISMATCH_TEXT, P2_SCOPE_TEXT, P2_TEXT_ENABLED } from '../../src/texts';

const worldDir = new URL('../../../../worlds/drawer-arm/', import.meta.url);
const plansDir = new URL('../../plans/', import.meta.url);

function planFile(name: string) {
  const parsed = parsePlanFile(readFileSync(new URL(name, plansDir), 'utf8'));
  if (!parsed.ok) throw new Error(`${name} invalid`);
  return parsed.plan;
}

describe('scenarios', () => {
  it('equal the shipped Plan_Files and carry their origin and names', () => {
    expect(FIRST_SCENARIO.plan).toEqual(planFile('first.plan.json'));
    expect(REVISED_SCENARIO.plan).toEqual(planFile('revised.plan.json'));
    expect(FIRST_SCENARIO.label).toBe('fast pull');
    expect(REVISED_SCENARIO.label).toBe('slow pull, strong grip');
    expect(REVISED_SCENARIO.plan.revisionOf).toBe(FIRST_SCENARIO.plan.name);
    expect(REVISED_SCENARIO.plan.origin).toBe('scripted');
  });
});

describe('deepEqual and p2CheckLines', () => {
  it('compares structurally and separates -0 from 0', () => {
    expect(deepEqual({ a: [1, 2, { b: 3 }] }, { a: [1, 2, { b: 3 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual([0], [-0])).toBe(false);
    expect(deepEqual(new Float64Array([1, 2]), new Float64Array([1, 2]))).toBe(true);
    expect(deepEqual(new Float64Array([1, 2]), new Float64Array([1, 3]))).toBe(false);
  });

  it('renders P2 lines only when enabled, the self-check passed, and a comparison exists', () => {
    const ok = { state: 'ok', hash: 'ab', restoreOk: true } as const;
    expect(P2_TEXT_ENABLED).toBe(true);
    expect(p2CheckLines(false, ok, true)).toBeNull();
    expect(p2CheckLines(true, { state: 'pending' }, true)).toBeNull();
    expect(p2CheckLines(true, { state: 'failed', reason: 'not-reproduced' }, true)).toBeNull();
    expect(p2CheckLines(true, ok, null)).toBeNull();
    expect(p2CheckLines(true, ok, true)).toEqual([P2_MATCH_TEXT, P2_CHECK_SCOPE_TEXT, P2_SCOPE_TEXT]);
    expect(p2CheckLines(true, ok, false)).toEqual([P2_MISMATCH_TEXT, P2_CHECK_SCOPE_TEXT, P2_SCOPE_TEXT]);
  });
});

describe('demo sequence through the reducer (real runs)', () => {
  let world: GhostHandWorld;
  beforeAll(async () => {
    world = await createGhostHandWorld({ recordFrames: true });
  }, 120_000);
  afterAll(() => {
    world.dispose();
  });

  it('blocks the first plan, passes the revised plan, and enables execute only for the unchanged passing plan', async () => {
    const w = parseWards(readFileSync(new URL('wards.yaml', worldDir), 'utf8'));
    const c = parseVariantConfig(readFileSync(new URL('variant-config.json', worldDir), 'utf8'));
    if (!w.ok || !c.ok) throw new Error('shipped config invalid');
    const runPlan = (plan: PlanFile) =>
      runGhostHand({
        plan: plan.actions,
        wardSet: w.wardSet,
        variantConfig: c.config,
        seed: c.config.defaultSeed,
        variantCount: c.config.defaultCount,
        world,
        executor: createInlineExecutor(() => createGhostHandWorld()),
        evidence: { selfCheck: { state: 'pending' }, capabilities: probeCapabilities() },
        planOrigin: plan.origin,
      });
    let state: AppState = INITIAL_STATE;
    const send = (e: AppEvent): void => {
      state = reducer(state, e);
    };

    send({ type: 'plan-loaded', plan: FIRST_SCENARIO.plan });
    send({ type: 'run-started', explicit: true });
    send({ type: 'run-finished', run: await runPlan(FIRST_SCENARIO.plan), nowMs: 0 });
    expect(state.lastRun?.verdict).toBe('block');
    expect(state.graveyard).toHaveLength(1);
    expect(canExecuteReference(state)).toBe(false);

    send({ type: 'plan-loaded', plan: REVISED_SCENARIO.plan });
    send({ type: 'run-started', explicit: true });
    send({ type: 'run-finished', run: await runPlan(REVISED_SCENARIO.plan), nowMs: 0 });
    expect(state.lastRun?.verdict).toBe('pass');
    expect(canExecuteReference(state)).toBe(true);

    send({ type: 'plan-loaded', plan: FIRST_SCENARIO.plan });
    expect(canExecuteReference(state)).toBe(false);
  }, 300_000);
});

describe('reference execution of the revised plan', () => {
  let world: GhostHandWorld;
  beforeAll(async () => {
    world = await createGhostHandWorld({ recordFrames: true });
  }, 120_000);
  afterAll(() => {
    world.dispose();
  });

  it('matches the base ghost diff, opens the drawer, animates, and resets', async () => {
    const w = parseWards(readFileSync(new URL('wards.yaml', worldDir), 'utf8'));
    const c = parseVariantConfig(readFileSync(new URL('variant-config.json', worldDir), 'utf8'));
    if (!w.ok || !c.ok) throw new Error('shipped config invalid');
    const run = await runGhostHand({
      plan: REVISED_SCENARIO.plan.actions,
      wardSet: w.wardSet,
      variantConfig: c.config,
      seed: c.config.defaultSeed,
      variantCount: 1,
      world,
      executor: createInlineExecutor(() => createGhostHandWorld()),
      evidence: { selfCheck: { state: 'pending' }, capabilities: probeCapabilities() },
      planOrigin: 'scripted',
    });
    const initial = drawerDisplacementOf((await world.snapshot()).state);
    const result = await world.referenceExecute(REVISED_SCENARIO.plan.actions);
    expect(diffsMatch(run.baseChanges, result.changes)).toBe(true);
    expect(drawerDisplacementOf(result.final)).toBeGreaterThan(initial);
    const overlay = referenceOverlayInput(result);
    expect(overlay?.variants).toEqual([]);
    expect(overlay?.base.frames.length).toBeGreaterThan(0);
    await world.resetReference();
    expect(drawerDisplacementOf((await world.snapshot()).state)).toBe(initial);
  }, 120_000);
});
