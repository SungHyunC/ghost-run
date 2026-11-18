// Feature: ghost-hand, Property 22: The run holds one variant result per variant, in order
// **Validates: Requirements 6.10, 8.1, 8.3, 9.3**
// Engine-bound (the base ghost run uses the real engine), so the Short_Run count is `shortRuns` from
// worlds/drawer-arm/tests/pbt-budget.json; a Nightly_Run uses NUM_RUNS. Only the executor is a stub.
import { readFileSync } from 'node:fs';
import { WardEngine } from '@ghost-run/core';
import type { WardSet } from '@ghost-run/core';
import { parseWards } from '@ghost-run/wards-config';
import { createGhostHandWorld, parseVariantConfig } from '@ghost-run/drawer-arm';
import type { GhostHandAction, GhostHandWorld, VariantConfig } from '@ghost-run/drawer-arm';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Capabilities } from '../../src/capabilities';
import { failedOutcome } from '../../src/exec/executor';
import type { VariantExecutor, VariantOutcome } from '../../src/exec/executor';
import { runGhostHand } from '../../src/pipeline/run';
import type { GhostRun, RunInput } from '../../src/pipeline/types';
import { NUM_RUNS, PBT_MODE } from '../pbt-config';

const dir = new URL('../../../../worlds/drawer-arm/', import.meta.url);
const wardsText = readFileSync(new URL('wards.yaml', dir), 'utf8');
const configText = readFileSync(new URL('variant-config.json', dir), 'utf8');
const shortRuns = (JSON.parse(readFileSync(new URL('tests/pbt-budget.json', dir), 'utf8')) as { shortRuns: number })
  .shortRuns;
const RUNS = PBT_MODE === 'nightly' ? NUM_RUNS : shortRuns;

const caps: Capabilities = { jointSelfWard: false, claimsOptional: true, bannerNotApplicable: false };

let world: GhostHandWorld;
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
}, 120_000);

afterAll(() => world?.dispose());

/** Stub pool: outcomes depend on the index and a salt, are built in a shuffled order, and returned by index. */
function stubExecutor(salt: number): VariantExecutor {
  return {
    run: (jobs) => {
      const order = [...jobs].sort((a, b) => ((a.index * 7919 + salt) % 97) - ((b.index * 7919 + salt) % 97));
      const built: VariantOutcome[] = order.map((j) => {
        const base = failedOutcome(j, '');
        const ok = (j.index + salt) % 3 !== 0;
        const { engineError: _drop, ...rest } = base;
        void _drop;
        return ok ? { ...rest, finalDrawerM: 0.12 } : base;
      });
      const out: VariantOutcome[] = [];
      for (const o of built) out[o.index] = o;
      return Promise.resolve(out);
    },
    dispose: () => undefined,
  };
}

const actionArb: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc.record({
    type: fc.constant('reach' as const),
    target: fc.tuple(
      fc.double({ min: -0.3, max: 0.3, noNaN: true }),
      fc.double({ min: -0.3, max: 0.7, noNaN: true }),
      fc.double({ min: 0.05, max: 0.7, noNaN: true }),
    ),
    speed: fc.double({ min: 0.3, max: 0.6, noNaN: true }),
  }),
  fc.record({ type: fc.constant('grasp' as const), force: fc.double({ min: 2, max: 40, noNaN: true }) }),
  fc.record({
    type: fc.constant('pull' as const),
    distance: fc.double({ min: 0.02, max: 0.25, noNaN: true }),
    speed: fc.double({ min: 0.3, max: 0.6, noNaN: true }),
  }),
  fc.constant({ type: 'release' as const }),
);

const planArb = fc.array(actionArb, { minLength: 1, maxLength: 2 });

async function runOnce(plan: readonly GhostHandAction[], seed: number, count: number): Promise<GhostRun> {
  const input: RunInput = {
    plan,
    wardSet,
    variantConfig,
    seed,
    variantCount: count,
    world,
    executor: stubExecutor(seed),
    evidence: { selfCheck: { state: 'pending' }, capabilities: caps },
  };
  return runGhostHand(input);
}

function assertOrder(run: GhostRun, count: number): void {
  const ids = Array.from({ length: count }, (_, i) => `variant-${i}`);
  expect(run.variantResults).toHaveLength(count);
  expect(run.variantResults.map((r) => r.variantId)).toEqual(ids);
  expect(run.rows.map((r) => r.id)).toEqual(['base', ...ids]);
  expect(run.rows).toHaveLength(count + 1);
  expect(run.engineVerdict).toEqual(
    WardEngine.evaluate(
      { snapshots: [], changes: [], effectsOutside: [], observedEvents: [], variantResults: run.variantResults },
      wardSet,
    ),
  );
}

describe('Property 22: The run holds one variant result per variant, in order', () => {
  it(
    'has count results in ascending order, the base row first, and the engine verdict of the same report',
    async () => {
      await fc.assert(
        fc.asyncProperty(planArb, fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 1, max: 20 }), async (plan, seed, count) => {
          assertOrder(await runOnce(plan, seed, count), count);
        }),
        { numRuns: RUNS },
      );
    },
    PBT_MODE === 'nightly' ? 0 : 600_000,
  );

  it('fixed example: 20 variants, one action', async () => {
    assertOrder(await runOnce([{ type: 'release' }], 1, 20), 20);
  }, 60_000);

  it('fixed example: a single variant', async () => {
    assertOrder(await runOnce([{ type: 'grasp', force: 2 }], 0, 1), 1);
  }, 60_000);
});
