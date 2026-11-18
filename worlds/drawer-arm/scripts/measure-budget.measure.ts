// Env-gated measurement for task 7.7 (skipped unless GHOST_MEASURE_OUT is set). Run it through
// scripts/measure-budget.mjs, which also records the machine load. It lives under scripts/ because the
// package scan forbids importing the core subpath '@ghost-run/core/verify' from tests/.
import { writeFileSync } from 'node:fs';
import type { Snapshot } from '@ghost-run/core';
import { verifyWorld } from '@ghost-run/core/verify';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadMujoco } from '../src/engine/index.js';
import { createReferenceTestAdapter } from '../src/reference.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { WORLD_CONFIG } from '../src/world-config.js';
import { createGhostHandWorld } from '../src/world.js';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const OUT = env['GHOST_MEASURE_OUT'];
const VERIFY_RUNS = Number(env['GHOST_MEASURE_VERIFY_RUNS'] ?? '0');
const REPS = 5;
const PLAN_STEPS = Math.round(WORLD_CONFIG.perPlanLimitS / WORLD_CONFIG.timeStepS);

const now = (): number => performance.now();
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;

/** Candidate actions, cycled until the plan limit is used up. */
const CYCLE: GhostHandAction[] = [
  { type: 'reach', target: [0, 0.2, 0.18], speed: 0.4 },
  { type: 'reach', target: [0, 0.02, 0.18], speed: 0.2 },
  { type: 'grasp', force: 20 },
  { type: 'pull', distance: 0.15, speed: 0.15 },
  { type: 'release' },
  { type: 'reach', target: [0.2, 0.2, 0.4], speed: 0.1 },
  { type: 'reach', target: [-0.2, 0.2, 0.2], speed: 0.1 },
];

const actionArb: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc.record({
    type: fc.constant('reach' as const),
    target: fc.tuple(
      fc.double({ min: -0.3, max: 0.3, noNaN: true }),
      fc.double({ min: -0.3, max: 0.7, noNaN: true }),
      fc.double({ min: 0.05, max: 0.7, noNaN: true }),
    ),
    speed: fc.double({ min: 0.05, max: 0.6, noNaN: true }),
  }),
  fc.record({ type: fc.constant('grasp' as const), force: fc.double({ min: 2, max: 40, noNaN: true }) }),
  fc.record({
    type: fc.constant('pull' as const),
    distance: fc.double({ min: 0.02, max: 0.25, noNaN: true }),
    speed: fc.double({ min: 0.05, max: 0.6, noNaN: true }),
  }),
  fc.constant({ type: 'release' as const }),
);

describe.skipIf(OUT === undefined)('measure-budget', () => {
  it('measures the step cost, the worst example, and verifyWorld', async () => {
    const mujoco = await loadMujoco();
    const world = await createGhostHandWorld({ mujoco });
    const adapter = createReferenceTestAdapter(mujoco);
    try {
      // Build the worst plan: keep adding actions while they succeed and the step budget allows.
      const start = await world.snapshot();
      const plan: GhostHandAction[] = [];
      let cur: Snapshot<GhostHandState> = start;
      for (let i = 0; i < 50 && cur.state.steps < PLAN_STEPS; i += 1) {
        const a = CYCLE[i % CYCLE.length] as GhostHandAction;
        const next = await world.step(cur, a);
        if (!next.result.success) continue;
        plan.push(a);
        cur = next;
      }
      const planSteps = cur.state.steps;

      const ghost = async (): Promise<void> => {
        const s = await world.snapshot();
        let c = s;
        for (const a of plan) c = await world.step(c, a);
      };
      await ghost(); // warm-up (model compile, JIT)

      const ghostMs: number[] = [];
      for (let r = 0; r < REPS; r += 1) {
        const t = now();
        await ghost();
        ghostMs.push(now() - t);
      }
      const adapterMs: number[] = [];
      for (let r = 0; r < REPS; r += 1) {
        const s = await world.snapshot();
        const t = now();
        adapter.apply(structuredClone(s.state), plan);
        adapterMs.push(now() - t);
      }
      // One example of verifyWorld: 6 ghost runs, one adapter run, one fingerprint pair, snapshots.
      const exampleMs: number[] = [];
      for (let r = 0; r < REPS; r += 1) {
        const t = now();
        for (let k = 0; k < 6; k += 1) {
          await world.fingerprint();
          await ghost();
        }
        const s = await world.snapshot();
        adapter.apply(structuredClone(s.state), plan);
        exampleMs.push(now() - t);
      }
      const stepCostMicros = (median(ghostMs) * 1000) / planSteps;

      let verify: { numRuns: number; ms: number } | undefined;
      if (VERIFY_RUNS > 0) {
        const t = now();
        await verifyWorld(world, {
          id: 'drawer-arm',
          deterministic: true,
          wardSet: { wards: [{ id: 'gentle-hands', kind: 'physics', min_success_rate: 0.95, max_contact_force_n: 30, forbidden_contacts: ['vase'] }] },
          testAdapter: adapter,
          numRuns: VERIFY_RUNS,
          actionArb,
        });
        verify = { numRuns: VERIFY_RUNS, ms: now() - t };
      }

      writeFileSync(
        OUT as string,
        JSON.stringify({
          planActions: plan.length,
          planSteps,
          ghostRunMs: median(ghostMs),
          adapterRunMs: median(adapterMs),
          worstExampleMs: median(exampleMs),
          stepCostMicros,
          verify,
        }),
      );
      expect(planSteps).toBeGreaterThan(0);
    } finally {
      adapter.dispose();
      world.dispose();
    }
  });
});
