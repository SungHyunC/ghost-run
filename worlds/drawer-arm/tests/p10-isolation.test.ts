// Feature: ghost-hand, Property 10: A ghost run leaves reality unchanged (contract P1)
// **Validates: Requirements 3.4, 3.5, 8.9, 8.10, 17.4**
// Claim scope: per run, for the in-memory Reference_State. No hardware, no Docker, no untracked state.
// Engine-bound, so a Short_Run uses ENGINE_RUNS (`shortRuns` of pbt-budget.json); a Nightly_Run uses NUM_RUNS.
import { ghostRun } from '@ghost-run/core';
import type { Snapshot } from '@ghost-run/core';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import variantConfigJson from '../variant-config.json' with { type: 'json' };
import { fingerprintOf } from '../src/fingerprint.js';
import { runVariantJob } from '../src/run-variant.js';
import type { VariantOutcome } from '../src/run-variant.js';
import { sampleVariant } from '../src/variant.js';
import { parseVariantConfig } from '../src/variant-config.js';
import type { VariantConfig } from '../src/variant-config.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { createGhostHandWorld } from '../src/world.js';
import type { GhostHandWorld } from '../src/world.js';
import { ENGINE_RUNS, PBT_TIMEOUT } from './pbt-config.js';

const VARIANTS = 3;

let world: GhostHandWorld;
let variantConfig: VariantConfig;

beforeAll(async () => {
  const parsed = parseVariantConfig(JSON.stringify(variantConfigJson));
  if (!parsed.ok) throw new Error('variant-config.json invalid');
  variantConfig = parsed.config;
  world = await createGhostHandWorld({ recordFrames: true });
}, 120_000);

afterAll(() => world?.dispose());

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

const planArb = fc.array(actionArb, { minLength: 1, maxLength: 50 });
const prefixArb = fc.array(actionArb, { minLength: 0, maxLength: 6 });
const seedArb = fc.integer({ min: 0, max: 0xffffffff });

interface Summary {
  readonly success: readonly boolean[];
  readonly stateHashes: readonly string[];
  readonly changes: unknown;
  readonly outcomes: readonly VariantOutcome[];
  readonly reality: string;
}

/** One ghost run of the plan on the live state, then every variant run. Returns what it produced. */
async function ghost(plan: readonly GhostHandAction[], seed: number, check: (stage: string) => Promise<void>): Promise<Summary> {
  const start = await world.snapshot();
  const report = await ghostRun(world, start, plan);
  await check('ghostRun');
  const snaps = report.snapshots as readonly Snapshot<GhostHandState>[];
  const stateHashes: string[] = [];
  for (const s of snaps) stateHashes.push((await fingerprintOf(s.state)).hash);
  const success = snaps.map((s) => s.result.success);
  const changes = report.changes;
  world.releaseTraces(snaps.map((s) => s.id));

  const outcomes: VariantOutcome[] = [];
  for (let i = 0; i < VARIANTS; i += 1) {
    outcomes.push(
      await runVariantJob(world, {
        index: i,
        params: sampleVariant(seed, i, variantConfig),
        startState: start.state,
        actions: plan,
        recordFrames: true,
      }),
    );
    await check(`variant ${String(i)}`);
  }
  return { success, stateHashes, changes, outcomes, reality: (await world.fingerprint()).hash };
}

async function throwingClocks<T>(fn: () => Promise<T>): Promise<T> {
  const realNow = Date.now;
  const realRandom = Math.random;
  Date.now = (): number => {
    throw new Error('Date.now called during a ghost run');
  };
  Math.random = (): number => {
    throw new Error('Math.random called during a ghost run');
  };
  try {
    return await fn();
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}

/** The whole property for one example: prefix moves reality, ghost leaves it, clocks do not matter. */
async function isolationHolds(prefix: readonly GhostHandAction[], plan: readonly GhostHandAction[], seed: number): Promise<void> {
  await world.resetReference();
  if (prefix.length > 0) await world.referenceExecute(prefix);
  const before = (await world.fingerprint()).hash;
  const check = async (stage: string): Promise<void> => {
    expect((await world.fingerprint()).hash, `reality hash after ${stage}`).toBe(before);
  };

  const normal = await ghost(plan, seed, check);
  const guarded = await throwingClocks(() => ghost(plan, seed, check));
  expect(guarded).toEqual(normal);
  expect(normal.reality).toBe(before);
}

describe('drawer-arm ghost isolation', () => {
  it(
    'Property 10 (contract P1): ghost and variant runs leave the live Reference_State unchanged',
    async () => {
      await fc.assert(
        fc.asyncProperty(prefixArb, planArb, seedArb, isolationHolds),
        { numRuns: ENGINE_RUNS },
      );
    },
    PBT_TIMEOUT === undefined ? 0 : 600_000,
  );

  it('fixed example: a moved reality stays moved and a pulled-open drawer is not touched by the ghost', async () => {
    const prefix: GhostHandAction[] = [{ type: 'reach', target: [0, 0.2, 0.18], speed: 0.4 }];
    const plan: GhostHandAction[] = [
      { type: 'reach', target: [0, 0.02, 0.18], speed: 0.1 },
      { type: 'grasp', force: 20 },
      { type: 'pull', distance: 0.1, speed: 0.2 },
      { type: 'release' },
    ];
    await isolationHolds(prefix, plan, 7);
  }, 120_000);

  it('fixed example: a failing action (out of time) still leaves reality unchanged', async () => {
    await isolationHolds([], [{ type: 'reach', target: [0, 0.7, 0.7], speed: 0.05 }], 0);
  }, 120_000);
});
