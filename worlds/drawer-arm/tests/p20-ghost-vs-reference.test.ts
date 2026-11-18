// Feature: ghost-hand, Property 20: The ghost diff equals the reference diff (contract P2)
// **Validates: Requirements 10.6, 17.3, 3.13**
// Claim scope: the Tested_Environments only (same engine build, same environment), Base_World runs only.
// Variant runs are excluded. This test says nothing about hardware.
import { ghostRun } from '@ghost-run/core';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngine, loadMujoco } from '../src/engine/index.js';
import type { Engine, MuJoCoModule } from '../src/engine/index.js';
import { REFERENCE_PLAN } from '../src/reference-plan.js';
import { referenceExecute } from '../src/reference.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { createGhostHandWorld } from '../src/world.js';
import type { GhostHandWorld } from '../src/world.js';
import { ENGINE_RUNS } from './pbt-config.js';

const PROPERTY_TIMEOUT = 600_000;

// Valid actions inside the declared ranges (WORLD_CONFIG.actionRanges).
const num = (min: number, max: number): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((v) => v + 0);

const actionArb: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc.record({
    type: fc.constant('reach' as const),
    target: fc.tuple(num(-0.3, 0.3), num(-0.3, 0.7), num(0.05, 0.7)),
    speed: num(0.05, 0.6),
  }),
  fc.record({ type: fc.constant('grasp' as const), force: num(2, 40) }),
  fc.record({ type: fc.constant('pull' as const), distance: num(0.02, 0.25), speed: num(0.05, 0.6) }),
  fc.constant({ type: 'release' as const }),
) as fc.Arbitrary<GhostHandAction>;

const planArb = fc.array(actionArb, { minLength: 0, maxLength: 12 });

/** Exact-bit structural form: typed arrays as bytes, -0 and NaN spelled out. */
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

let module: MuJoCoModule;
let world: GhostHandWorld;
let refEngine: Engine;

beforeAll(async () => {
  module = await loadMujoco();
  world = await createGhostHandWorld({ mujoco: module, recordTrajectory: false });
  // The reference runs on its own engine (own model and data), not on the world's.
  refEngine = createEngine(module);
}, 60_000);

afterAll(() => {
  refEngine.dispose();
  world.dispose();
});

async function compare(plan: readonly GhostHandAction[]): Promise<{ ghostCount: number; failed: number }> {
  const start = await world.snapshot();
  const report = await ghostRun(world, start, plan);
  const ghostChanges = report.changes.flat();
  const ghostFinal = (report.snapshots[report.snapshots.length - 1] as { state: GhostHandState }).state;
  const failed = report.snapshots.filter((s) => !s.result.success).length;
  world.releaseTraces(report.snapshots.map((s) => s.id));

  const ref = await referenceExecute(refEngine, start.state, plan);
  expect(normalize(ghostChanges)).toEqual(normalize(ref.changes));
  expect(normalize(ghostFinal)).toEqual(normalize(ref.final));
  return { ghostCount: ghostChanges.length, failed };
}

describe('Property 20: the ghost diff equals the reference diff (P2, Tested_Environments only)', () => {
  it(
    'holds for generated valid plans on the Base_World',
    async () => {
      await fc.assert(
        fc.asyncProperty(planArb, async (plan) => {
          await compare(plan);
        }),
        { numRuns: ENGINE_RUNS },
      );
    },
    PROPERTY_TIMEOUT,
  );

  it('fixed example: REFERENCE_PLAN gives equal diffs and equal final states, with a non-empty diff', async () => {
    const { ghostCount } = await compare(REFERENCE_PLAN);
    expect(ghostCount).toBeGreaterThan(0);
  });

  it('fixed example: a plan with a failing step still gives equal diffs and final states', async () => {
    const plan: GhostHandAction[] = [
      { type: 'reach', target: [0, 0.2, 0.18], speed: 0.4 },
      { type: 'pull', distance: 0.25, speed: 0.05 },
      { type: 'grasp', force: 20 },
    ];
    await compare(plan);
  });
});
