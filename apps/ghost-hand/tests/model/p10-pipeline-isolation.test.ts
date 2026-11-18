// Feature: ghost-hand, Property 10: A ghost run leaves reality unchanged (contract P1), pipeline leg
// **Validates: Requirements 3.4, 3.5, 8.9, 8.10, 17.4**
// Claim scope: per run, for the in-memory Reference_State. No hardware, no Docker, no untracked state.
// Engine-bound, so the Short_Run count is `shortRuns` from worlds/drawer-arm/tests/pbt-budget.json;
// a Nightly_Run uses NUM_RUNS. The executor is the real inline executor.
import { readFileSync } from 'node:fs';
import type { WardSet } from '@ghost-run/core';
import { parseWards } from '@ghost-run/wards-config';
import { createGhostHandWorld, parseVariantConfig } from '@ghost-run/drawer-arm';
import type { GhostHandAction, GhostHandWorld, VariantConfig } from '@ghost-run/drawer-arm';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Capabilities } from '../../src/capabilities';
import { createInlineExecutor } from '../../src/exec/inline';
import type { VariantExecutor } from '../../src/exec/executor';
import { runGhostHand } from '../../src/pipeline/run';
import type { GhostRun } from '../../src/pipeline/types';
import { NUM_RUNS, PBT_MODE } from '../pbt-config';

const dir = new URL('../../../../worlds/drawer-arm/', import.meta.url);
const wardsText = readFileSync(new URL('wards.yaml', dir), 'utf8');
const configText = readFileSync(new URL('variant-config.json', dir), 'utf8');
const shortRuns = (JSON.parse(readFileSync(new URL('tests/pbt-budget.json', dir), 'utf8')) as { shortRuns: number })
  .shortRuns;
const RUNS = PBT_MODE === 'nightly' ? NUM_RUNS : shortRuns;

const caps: Capabilities = { jointSelfWard: false, claimsOptional: true, bannerNotApplicable: false };
const VARIANTS = 3;

let world: GhostHandWorld;
let executor: VariantExecutor;
let wardSet: WardSet;
let variantConfig: VariantConfig;

beforeAll(async () => {
  const w = parseWards(wardsText);
  if (!w.ok) throw new Error('wards.yaml invalid');
  wardSet = w.wardSet;
  const c = parseVariantConfig(configText);
  if (!c.ok) throw new Error('variant-config.json invalid');
  variantConfig = c.config;
  world = await createGhostHandWorld({ recordFrames: true });
  executor = createInlineExecutor(() => createGhostHandWorld({ recordFrames: true }));
}, 120_000);

afterAll(() => {
  executor?.dispose();
  world?.dispose();
});

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

function runOnce(plan: readonly GhostHandAction[], seed: number): Promise<GhostRun> {
  return runGhostHand({
    plan,
    wardSet,
    variantConfig,
    seed,
    variantCount: VARIANTS,
    world,
    executor,
    evidence: { selfCheck: { state: 'pending' }, capabilities: caps },
  });
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

async function holds(prefix: readonly GhostHandAction[], plan: readonly GhostHandAction[], seed: number): Promise<void> {
  await world.resetReference();
  if (prefix.length > 0) await world.referenceExecute(prefix);
  const before = (await world.fingerprint()).hash;

  const normal = await runOnce(plan, seed);
  expect((await world.fingerprint()).hash, 'reality hash after runGhostHand').toBe(before);
  expect(normal.p1.before).toBe(before);
  expect(normal.p1.after).toBe(before);
  expect(normal.p1.equal).toBe(true);

  const guarded = await throwingClocks(() => runOnce(plan, seed));
  expect((await world.fingerprint()).hash, 'reality hash after the guarded run').toBe(before);
  expect(guarded).toEqual(normal);
}

describe('runGhostHand isolation', () => {
  it(
    'Property 10 (contract P1): runGhostHand leaves the live Reference_State unchanged and ignores the clock and random source',
    async () => {
      await fc.assert(fc.asyncProperty(prefixArb, planArb, seedArb, holds), { numRuns: RUNS });
    },
    PBT_MODE === 'nightly' ? 0 : 600_000,
  );

  it('fixed example: the reference plan prefix moves reality, then a drawer-pull plan runs', async () => {
    const prefix: GhostHandAction[] = [{ type: 'reach', target: [0, 0.2, 0.18], speed: 0.4 }];
    const plan: GhostHandAction[] = [
      { type: 'reach', target: [0, 0.02, 0.18], speed: 0.1 },
      { type: 'grasp', force: 20 },
      { type: 'pull', distance: 0.1, speed: 0.2 },
      { type: 'release' },
    ];
    await holds(prefix, plan, 7);
  }, 120_000);

  it('fixed example: a plan whose action runs out of time keeps the fingerprints equal', async () => {
    await holds([], [{ type: 'reach', target: [0, 0.7, 0.7], speed: 0.05 }], 0);
  }, 120_000);
});
