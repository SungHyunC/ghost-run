import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ghostRun } from '../src/index.js';
import { KeyValueWorld, actionArb, planArb, worldStateArb } from './fixtures/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { createPlanStats, deepEqual } from './pbt-stats.js';

// Mix of default-size plans and max-size plans so every length bucket is populated.
const mixedPlanArb = fc.oneof(
  planArb,
  fc.array(actionArb, { minLength: 1, maxLength: 50, size: 'max' }),
);

describe('P1: ghost run isolation', () => {
  // Feature: core-contract, Property 1: ghost run never changes reality
  // **Validates: Requirements 8.1, 8.3**
  it(
    'fingerprint of reality is unchanged by any ghost run',
    async () => {
      const stats = createPlanStats('P1');
      await fc.assert(
        fc.asyncProperty(worldStateArb, mixedPlanArb, async (initial, actions) => {
          const world = new KeyValueWorld(initial);
          const fpBefore = await world.fingerprint();
          const snapshot = await world.snapshot();
          const report = await ghostRun(world, snapshot, actions);
          const fpAfter = await world.fingerprint();

          const last = report.snapshots[report.snapshots.length - 1];
          stats.record(actions.length, last !== undefined && !deepEqual(last.state, snapshot.state));

          expect(fpAfter.hash).toBe(fpBefore.hash);
        }),
        { numRuns: NUM_RUNS },
      );
      stats.print();
      expect(stats.runs).toBe(NUM_RUNS);
      stats.assertNonVacuous();
    },
    PBT_TIMEOUT ?? 0,
  );
});
