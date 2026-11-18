// Golden_Hash check (requirements 10.7, 17.7, 17.8).
// Claim scope: the Tested_Environments only. The Node hash must equal tests/golden.json.
// A differing hash is never written automatically: update golden.json by hand after review.
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadMujoco } from '../src/engine/index.js';
import type { MuJoCoModule } from '../src/engine/index.js';
import { REFERENCE_PLAN, REFERENCE_PLAN_ID } from '../src/reference-plan.js';
import { createGhostHandWorld } from '../src/world.js';

const HEX64 = /^[0-9a-f]{64}$/;

interface Golden {
  readonly planId: string;
  readonly hash: string;
  readonly recordedWith: { readonly node: string; readonly machine: string; readonly chrome?: string };
}

let mujoco: MuJoCoModule;

async function hashOnFreshWorld(): Promise<string> {
  const world = await createGhostHandWorld({ mujoco });
  try {
    return (await world.referenceExecute(REFERENCE_PLAN)).trajectoryHash;
  } finally {
    world.dispose();
  }
}

beforeAll(async () => {
  mujoco = await loadMujoco();
}, 60_000);

describe('Golden_Hash', () => {
  it('reproduces on two fresh Base_World runs and equals tests/golden.json', async () => {
    const first = await hashOnFreshWorld();
    const second = await hashOnFreshWorld();
    expect(first).toMatch(HEX64);
    expect(second).toBe(first);

    const golden = JSON.parse(await readFile(new URL('./golden.json', import.meta.url), 'utf8')) as Golden;
    expect(golden.planId).toBe(REFERENCE_PLAN_ID);
    expect(golden.hash).toMatch(HEX64);
    expect(golden.recordedWith.node).toMatch(/^\d+\.\d+\.\d+$/);
    expect(golden.recordedWith.machine.length).toBeGreaterThan(0);
    expect(first, `computed hash ${first} differs from golden.json`).toBe(golden.hash);
  }, 120_000);
});
