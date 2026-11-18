// Env-gated (skipped unless GHOST_NODE_HASH_OUT is set): the Trajectory_Hash of REFERENCE_PLAN on two fresh
// Base_World instances in Node. Run it through tests/browser/cross-env.mjs.
import { writeFileSync } from 'node:fs';
import { REFERENCE_PLAN, createGhostHandWorld } from '@ghost-run/drawer-arm';
import { describe, it } from 'vitest';

const env = (globalThis as { process?: { env?: Record<string, string | undefined>; version?: string } }).process;
const OUT = env?.env?.['GHOST_NODE_HASH_OUT'];

describe.skipIf(OUT === undefined)('node hash', () => {
  it('hashes REFERENCE_PLAN twice', async () => {
    const hashes: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const world = await createGhostHandWorld({ recordFrames: false });
      try {
        hashes.push((await world.referenceExecute(REFERENCE_PLAN)).trajectoryHash);
      } finally {
        world.dispose();
      }
    }
    writeFileSync(OUT as string, JSON.stringify({ node: env?.version, hashes }));
  });
});
