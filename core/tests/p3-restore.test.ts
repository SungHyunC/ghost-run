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

describe('P3: snapshot immutability and replay determinism', () => {
  // Feature: core-contract, Property 3: snapshot immutability and replay determinism
  // **Validates: Requirements 10.1, 10.2, 10.4**
  it(
    'ghostRun does not mutate the input snapshot',
    async () => {
      const stats = createPlanStats('P3 immutability');
      await fc.assert(
        fc.asyncProperty(worldStateArb, mixedPlanArb, async (initial, actions) => {
          const world = new KeyValueWorld(initial);
          const s = await world.snapshot();
          const before = structuredClone(s.state);
          const report = await ghostRun(world, s, actions);

          const last = report.snapshots[report.snapshots.length - 1];
          stats.record(actions.length, last !== undefined && !deepEqual(last.state, before));

          expect(s.state).toEqual(before);
        }),
        { numRuns: NUM_RUNS },
      );
      stats.print();
      expect(stats.runs).toBe(NUM_RUNS);
      stats.assertNonVacuous();
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: core-contract, Property 3: snapshot immutability and replay determinism
  // **Validates: Requirements 10.1, 10.2, 10.4**
  it(
    'replaying the same snapshot and actions yields identical final states',
    async () => {
      const stats = createPlanStats('P3 determinism');
      await fc.assert(
        fc.asyncProperty(worldStateArb, mixedPlanArb, async (initial, actions) => {
          const world = new KeyValueWorld(initial);
          const s = await world.snapshot();
          const r1 = await ghostRun(world, s, actions);
          const r2 = await ghostRun(world, s, actions);

          const last1 = r1.snapshots[r1.snapshots.length - 1];
          const last2 = r2.snapshots[r2.snapshots.length - 1];
          stats.record(actions.length, last1 !== undefined && !deepEqual(last1.state, s.state));

          expect(last1).toBeDefined();
          expect(last2).toBeDefined();
          expect(last2?.state).toEqual(last1?.state);
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
