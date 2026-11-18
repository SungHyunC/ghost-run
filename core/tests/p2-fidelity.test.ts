import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ghostRun } from '../src/index.js';
import { KeyValueWorld, actionArb, kvTestAdapter, planArb, worldStateArb } from './fixtures/index.js';
import type { KVState } from './fixtures/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { createPlanStats } from './pbt-stats.js';

// Mix of default-size plans and max-size plans so every length bucket is populated.
const mixedPlanArb = fc.oneof(
  planArb,
  fc.array(actionArb, { minLength: 1, maxLength: 50, size: 'max' }),
);

/** Initial states of a world marked deterministic (KeyValueWorld has no time, PID or network input). */
const deterministicWorldStateArb: fc.Arbitrary<{ deterministic: true; state: KVState }> =
  worldStateArb.map((state) => ({ deterministic: true as const, state }));

describe('P2: ghost diff equals real diff in deterministic worlds', () => {
  // Feature: core-contract, Property 2: ghost diff equals real diff
  // **Validates: Requirements 9.1, 9.3**
  it(
    'ghost changes equal the changes of real execution from the same state',
    async () => {
      const stats = createPlanStats('P2 fidelity');
      let nonEmptyReal = 0;
      await fc.assert(
        fc.asyncProperty(deterministicWorldStateArb, mixedPlanArb, async (w, actions) => {
          expect(w.deterministic).toBe(true);

          // Instance A: ghost run on a snapshot.
          const worldA = new KeyValueWorld(w.state);
          const s = await worldA.snapshot();
          const report = await ghostRun(worldA, s, actions);
          const ghostChanges = report.changes.flat();

          // Instance B: same state, real (live) execution.
          const realChanges = kvTestAdapter.apply(w.state, actions);

          const nonEmpty = realChanges.length > 0;
          if (nonEmpty) nonEmptyReal++;
          stats.record(actions.length, nonEmpty);

          expect(ghostChanges).toEqual(realChanges);
        }),
        { numRuns: NUM_RUNS },
      );
      stats.print();
      console.log(`P2 fidelity non-empty realChanges: ${nonEmptyReal}/${stats.runs}`);
      expect(stats.runs).toBe(NUM_RUNS);
      stats.assertNonVacuous();
      expect(nonEmptyReal).toBeGreaterThan(0);
    },
    PBT_TIMEOUT ?? 0,
  );
});
