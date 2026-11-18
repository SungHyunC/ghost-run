// Feature: ghost-hand, Property 17: Valid plans complete within the declared limits
// **Validates: Requirements 5.4, 5.5, 3.12**
// Only valid actions reach ghostRun (effectsOutside throws for an invalid action by contract).
import { ghostRun } from '@ghost-run/core';
import type { GhostReport } from '@ghost-run/core';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadMujoco } from '../src/engine/index.js';
import type { MuJoCoModule } from '../src/engine/index.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { WORLD_CONFIG } from '../src/world-config.js';
import { createGhostHandWorld } from '../src/world.js';
import type { GhostHandWorld } from '../src/world.js';
import { ENGINE_RUNS } from './pbt-config.js';

const RUN_TIMEOUT_MS = 300_000;
const R = WORLD_CONFIG.actionRanges;
type Range = readonly [number, number];

const num = ([min, max]: Range): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((v) => v + 0);

const reach: fc.Arbitrary<GhostHandAction> = fc.record({
  type: fc.constant('reach' as const),
  target: fc.tuple(num(R.target.x), num(R.target.y), num(R.target.z)),
  speed: num(R.speed),
});
// Far target at the lowest speed: cannot finish within the per-action limit (3 s).
const slowReach: fc.Arbitrary<GhostHandAction> = fc.record({
  type: fc.constant('reach' as const),
  target: fc.tuple(num(R.target.x), fc.double({ min: 0.6, max: 0.7, noNaN: true }).map((v) => v + 0), num(R.target.z)),
  speed: fc.double({ min: 0.05, max: 0.07, noNaN: true }).map((v) => v + 0),
});
const grasp: fc.Arbitrary<GhostHandAction> = fc.record({ type: fc.constant('grasp' as const), force: num(R.force) });
const pull: fc.Arbitrary<GhostHandAction> = fc.record({
  type: fc.constant('pull' as const),
  distance: num(R.distance),
  speed: num(R.speed),
});
const release: fc.Arbitrary<GhostHandAction> = fc.constant({ type: 'release' as const });

const anyAction: fc.Arbitrary<GhostHandAction> = fc.oneof(reach, grasp, pull, release);
const hardAction: fc.Arbitrary<GhostHandAction> = fc.oneof(reach, slowReach, grasp, grasp, pull, release);

const plan: fc.Arbitrary<GhostHandAction[]> = fc.oneof(
  { arbitrary: fc.array(anyAction, { minLength: 1, maxLength: 50 }), weight: 3 },
  // starts with pull or release
  {
    arbitrary: fc
      .tuple(fc.oneof(pull, release), fc.array(anyAction, { minLength: 0, maxLength: 49 }))
      .map(([first, rest]) => [first, ...rest]),
    weight: 2,
  },
  // repeated grasp (a grasp costs 300 steps, so 11 of them pass the plan limit)
  { arbitrary: fc.array(grasp, { minLength: 1, maxLength: 50 }), weight: 2 },
  // moves that cannot finish in time, mixed with the rest
  { arbitrary: fc.array(hardAction, { minLength: 1, maxLength: 50 }), weight: 3 },
);

/** Structural form: typed arrays as exact bytes, numbers by Object.is (-0, NaN). */
function normalize(v: unknown): unknown {
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : Number.isNaN(v) ? 'NaN' : v;
  if (ArrayBuffer.isView(v)) {
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return `${v.constructor.name}:${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'object' && v !== null) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalize(x)]));
  }
  return v;
}

const PLAN_LIMIT_STEPS = Math.floor(WORLD_CONFIG.perPlanLimitS / WORLD_CONFIG.timeStepS + 0.5);

async function run(w: GhostHandWorld, actions: readonly GhostHandAction[]): Promise<GhostReport<GhostHandState>> {
  const report = await ghostRun(w, await w.snapshot(), actions);
  return report;
}

/** Checks every leg of Property 17 for one report. */
function checkReport(report: GhostReport<GhostHandState>, actions: readonly GhostHandAction[]): void {
  expect(report.snapshots).toHaveLength(actions.length + 1);
  let simulatedSteps = 0;
  for (let i = 0; i < actions.length; i += 1) {
    const before = report.snapshots[i] as GhostReport<GhostHandState>['snapshots'][number];
    const after = report.snapshots[i + 1] as GhostReport<GhostHandState>['snapshots'][number];
    const action = actions[i] as GhostHandAction;
    if (after.result.success) {
      // time only grows by the steps of a successful step, and never past the plan limit
      expect(after.state.steps).toBeGreaterThanOrEqual(before.state.steps);
      simulatedSteps += after.state.steps - before.state.steps;
      expect(after.state.steps * WORLD_CONFIG.timeStepS).toBeLessThanOrEqual(WORLD_CONFIG.perPlanLimitS + 1e-9);
      if (action.type !== 'grasp' && action.type !== 'reach' && !before.state.controller.holding) {
        // pull or release without a hold: no-op that reports success
        expect(normalize(after.state)).toEqual(normalize(before.state));
      }
    } else {
      expect(after.result.error).toMatch(/exceeds time limit/);
      expect(normalize(after.state)).toEqual(normalize(before.state));
    }
  }
  const final = report.snapshots[actions.length] as GhostReport<GhostHandState>['snapshots'][number];
  expect(simulatedSteps).toBe(final.state.steps - (report.snapshots[0] as { state: GhostHandState }).state.steps);
  expect(simulatedSteps).toBeLessThanOrEqual(PLAN_LIMIT_STEPS);
}

describe('Property 17: valid plans complete within the declared limits', () => {
  let module: MuJoCoModule;
  beforeAll(async () => {
    module = await loadMujoco();
  }, 60_000);

  it('does not throw, stays within the plan limit, and fails over-limit steps with an unchanged state', async () => {
    const world = await createGhostHandWorld({ mujoco: module });
    try {
      await fc.assert(
        fc.asyncProperty(plan, async (actions) => {
          const report = await run(world, actions);
          try {
            checkReport(report, actions);
          } finally {
            world.releaseTraces(report.snapshots.map((s) => s.id));
          }
        }),
        { numRuns: ENGINE_RUNS },
      );
    } finally {
      world.dispose();
    }
  }, RUN_TIMEOUT_MS);

  describe('fixed examples', () => {
    it('fails a far reach at the lowest speed with the action limit error and an unchanged state', async () => {
      const world = await createGhostHandWorld({ mujoco: module });
      try {
        const actions: GhostHandAction[] = [{ type: 'reach', target: [0, 0.7, 0.7], speed: 0.05 }];
        const report = await run(world, actions);
        const [before, after] = report.snapshots;
        expect(after?.result).toEqual({ success: false, error: 'action exceeds time limit' });
        expect(normalize(after?.state)).toEqual(normalize(before?.state));
      } finally {
        world.dispose();
      }
    }, RUN_TIMEOUT_MS);

    it('fails the 11th grasp with the plan limit error and keeps the state of the 10th', async () => {
      const world = await createGhostHandWorld({ mujoco: module });
      try {
        const actions: GhostHandAction[] = Array.from({ length: 11 }, () => ({ type: 'grasp', force: 10 }));
        const report = await run(world, actions);
        const results = report.snapshots.map((s) => s.result);
        expect(results.slice(1, 11).every((r) => r.success)).toBe(true);
        expect(results[11]).toEqual({ success: false, error: 'plan exceeds time limit' });
        expect(normalize(report.snapshots[11]?.state)).toEqual(normalize(report.snapshots[10]?.state));
        expect(report.snapshots[10]?.state.steps).toBe(PLAN_LIMIT_STEPS);
      } finally {
        world.dispose();
      }
    }, RUN_TIMEOUT_MS);

    it('reports success and leaves the state unchanged for pull and release as first actions', async () => {
      const world = await createGhostHandWorld({ mujoco: module });
      try {
        const actions: GhostHandAction[] = [
          { type: 'pull', distance: 0.1, speed: 0.1 },
          { type: 'release' },
        ];
        const report = await run(world, actions);
        for (let i = 1; i <= 2; i += 1) {
          expect(report.snapshots[i]?.result).toEqual({ success: true });
          expect(normalize(report.snapshots[i]?.state)).toEqual(normalize(report.snapshots[0]?.state));
        }
      } finally {
        world.dispose();
      }
    }, RUN_TIMEOUT_MS);
  });
});
