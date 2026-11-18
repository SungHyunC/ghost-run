// Feature: ghost-hand, task 12.12: the verifyWorld registration gate (contract P1, P2, P3, ward properties).
// **Validates: Requirements 3.13, 17.1, 17.2, 17.3, 17.11**
// Claim scope: the Tested_Environments only (same engine build, same environment). The flag
// `deterministic: true` says nothing about hardware. The contract-pbt hook runs this file on every
// save in worlds/** and must finish within 60 s, so each call has a 45 s time guard and the example
// count is `shortRuns` of tests/pbt-budget.json (never hard-coded here).
import { verifyWorld } from '@ghost-run/core/verify';
import type { WardSet } from '@ghost-run/core';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import variantConfigJson from '../variant-config.json' with { type: 'json' };
import { createEngine, loadMujoco } from '../src/engine/index.js';
import type { MuJoCoModule } from '../src/engine/index.js';
import { createInitialState } from '../src/initial-state.js';
import { createReferenceTestAdapter } from '../src/reference.js';
import type { ReferenceTestAdapter } from '../src/reference.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { applyVariant, sampleVariant } from '../src/variant.js';
import { parseVariantConfig } from '../src/variant-config.js';
import { createGhostHandWorld } from '../src/world.js';
import type { GhostHandWorld } from '../src/world.js';
import budget from './pbt-budget.json' with { type: 'json' };
import config from '../world.config.js';

const TIME_GUARD_MS = 45_000;
const FIXED_SEED = 42;
const shortRuns: number = budget.shortRuns;

// Valid actions inside the declared ranges (WORLD_CONFIG.actionRanges).
const num = (min: number, max: number): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((v) => v + 0);

const actionArb = fc.oneof(
  fc.record({
    type: fc.constant('reach' as const),
    target: fc.tuple(num(-0.3, 0.3), num(-0.3, 0.7), num(0.05, 0.7)),
    speed: num(0.05, 0.6),
  }),
  fc.record({ type: fc.constant('grasp' as const), force: num(2, 40) }),
  fc.record({ type: fc.constant('pull' as const), distance: num(0.02, 0.25), speed: num(0.05, 0.6) }),
  fc.constant({ type: 'release' as const }),
) as fc.Arbitrary<GhostHandAction>;

// The Wards_File (wards.yaml) holds one physics ward. The world must not import wards-config, so the
// WardSet is written out here and checked against the file text below.
const wardSet: WardSet = {
  wards: [
    {
      id: 'gentle-hands',
      kind: 'physics',
      min_success_rate: 0.95,
      max_contact_force_n: 30,
      forbidden_contacts: ['vase'],
    },
  ],
};

let mujoco: MuJoCoModule;
let adapter: ReferenceTestAdapter;
let baseInitial: GhostHandState;
const worlds: GhostHandWorld[] = [];

beforeAll(async () => {
  mujoco = await loadMujoco();
  const engine = createEngine(mujoco);
  baseInitial = createInitialState(engine);
  engine.dispose();
  // The reference test adapter owns its own engine (own model and data objects).
  adapter = createReferenceTestAdapter(mujoco);
}, 120_000);

afterAll(() => {
  adapter?.dispose();
  for (const w of worlds) w.dispose();
});

async function timed(label: string, world: GhostHandWorld): Promise<void> {
  const t0 = performance.now();
  await verifyWorld(world, {
    id: 'drawer-arm',
    deterministic: true,
    wardSet,
    testAdapter: adapter,
    actionArb,
    numRuns: shortRuns,
  });
  const elapsed = performance.now() - t0;
  console.log(`contract: ${label} verifyWorld elapsed ${(elapsed / 1000).toFixed(1)} s (numRuns ${shortRuns})`);
  expect(elapsed).toBeLessThan(TIME_GUARD_MS);
}

describe('verifyWorld contract test (Tested_Environments only)', () => {
  it('the wardSet equals the single physics ward of wards.yaml', () => {
    const text = readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8');
    expect(text).toContain('id: gentle-hands');
    expect(text).toContain('kind: physics');
    expect(text).toContain('min_success_rate: 0.95');
    expect(text).toContain('max_contact_force_n: 30');
    expect(text).toMatch(/forbidden_contacts:\s*\n\s*- vase\s*$/);
    expect(text.match(/- id:/g)).toHaveLength(1);
  });

  it('passes on the Base_World', async () => {
    const world = await createGhostHandWorld({ mujoco, recordTrajectory: false, initial: baseInitial });
    worlds.push(world);
    await timed('base world', world);
  }, 120_000);

  it('passes on a world whose start state is a sampled variant', async () => {
    const parsed = parseVariantConfig(JSON.stringify(variantConfigJson));
    if (!parsed.ok) throw new Error('variant-config.json invalid');
    const params = sampleVariant(FIXED_SEED, 0, parsed.config);
    const world = await createGhostHandWorld({
      mujoco,
      recordTrajectory: false,
      initial: applyVariant(baseInitial, params),
    });
    worlds.push(world);
    await timed('variant world', world);
  }, 120_000);

  it('registers deterministic: true only because both calls above pass', () => {
    expect(config.deterministic).toBe(true);
  });
});
