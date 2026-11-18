// Feature: ghost-hand, Property 5: Variant determinism and partition independence (GH-P4)
// **Validates: Requirements 6.5, 8.7, 8.3, 17.6**
// Claim scope (P8): Node.js 20.20.2 and Chrome 157 on an Apple M1 Mac only. In other environments this is
// evidence. This file is the Node leg: the real inline executor against a simulated pool (the real pool
// executor with fake workers, and a scheduler that completes jobs in a generated order). The real-Worker leg
// runs in the Chrome harness (task 17.1).
// Engine-bound, so the Short_Run count is `shortRuns` from worlds/drawer-arm/tests/pbt-budget.json;
// a Nightly_Run uses NUM_RUNS.
import { readFileSync } from 'node:fs';
import type { WardSet } from '@ghost-run/core';
import { parseWards } from '@ghost-run/wards-config';
import { WORLD_CONFIG, createGhostHandWorld, parseVariantConfig, runVariantJob } from '@ghost-run/drawer-arm';
import type { GhostHandAction, GhostHandWorld, VariantConfig } from '@ghost-run/drawer-arm';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Capabilities } from '../../src/capabilities';
import { createInlineExecutor } from '../../src/exec/inline';
import { createPoolExecutor } from '../../src/exec/pool';
import type { WorkerLike } from '../../src/exec/pool';
import type { VariantExecutor, VariantJob, VariantOutcome } from '../../src/exec/executor';
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

let world: GhostHandWorld;
let inline: VariantExecutor;
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
  inline = createInlineExecutor(() => createGhostHandWorld({ recordFrames: true }));
}, 120_000);

afterAll(() => {
  inline?.dispose();
  world?.dispose();
});

const R = WORLD_CONFIG.actionRanges;
const actionArb: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc.record({
    type: fc.constant('reach' as const),
    target: fc.tuple(
      fc.double({ min: R.target.x[0], max: R.target.x[1], noNaN: true }),
      fc.double({ min: R.target.y[0], max: R.target.y[1], noNaN: true }),
      fc.double({ min: R.target.z[0], max: R.target.z[1], noNaN: true }),
    ),
    speed: fc.double({ min: R.speed[0], max: R.speed[1], noNaN: true }),
  }),
  fc.record({ type: fc.constant('grasp' as const), force: fc.double({ min: R.force[0], max: R.force[1], noNaN: true }) }),
  fc.record({
    type: fc.constant('pull' as const),
    distance: fc.double({ min: R.distance[0], max: R.distance[1], noNaN: true }),
    speed: fc.double({ min: R.speed[0], max: R.speed[1], noNaN: true }),
  }),
  fc.constant({ type: 'release' as const }),
);

const planArb = fc.array(actionArb, { minLength: 1, maxLength: 3 });
const seedArb = fc.integer({ min: 0, max: 0xffffffff });
const countArb = fc.integer({ min: 1, max: 20 });
const workersArb = fc.integer({ min: 1, max: 4 });
/** Keys that choose which finished job is delivered next: a permutation of the completion order. */
const orderArb = fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 40 });

interface Pending {
  readonly deliver: () => void;
  readonly ready: Promise<unknown>;
}

/** A pool of fake workers whose replies are released one at a time, in the order the keys choose. */
function simulatedPool(size: number, keys: readonly number[]): { executor: VariantExecutor; cleanup: () => void } {
  const pending: Pending[] = [];
  const worlds: Promise<GhostHandWorld>[] = [];
  let step = 0;
  let scheduled = false;

  const drain = (): void => {
    scheduled = false;
    if (pending.length === 0) return;
    const choice = pending.length === 1 ? 0 : (keys[step++ % keys.length] as number) % pending.length;
    const [entry] = pending.splice(choice, 1) as [Pending];
    void entry.ready.then(() => {
      entry.deliver();
      if (pending.length > 0) schedule();
    });
  };
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(drain, 0);
  };

  const spawn = (): WorkerLike => {
    const own = createGhostHandWorld({ recordFrames: true });
    worlds.push(own);
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage(message) {
        const job = (message as { job: VariantJob }).job;
        const ready = own.then((w) => runVariantJob(w, job));
        pending.push({
          ready,
          deliver: () => {
            void ready.then((outcome) => worker.onmessage?.({ data: { outcome } }));
          },
        });
        schedule();
      },
      terminate() {
        // worlds are disposed by cleanup
      },
    };
    return worker;
  };

  const executor = createPoolExecutor({ size, spawn });
  return {
    executor,
    cleanup: () => {
      executor.dispose();
      for (const w of worlds) void w.then((x) => x.dispose());
    },
  };
}

/** Wraps an executor so the outcomes (with their Trajectory_Hashes) can be compared as well. */
function recording(executor: VariantExecutor): { executor: VariantExecutor; outcomes: () => readonly VariantOutcome[] } {
  let last: readonly VariantOutcome[] = [];
  return {
    executor: {
      run: async (jobs) => {
        last = await executor.run(jobs);
        return last;
      },
      dispose: () => undefined,
    },
    outcomes: () => last,
  };
}

async function runWith(
  executor: VariantExecutor,
  plan: readonly GhostHandAction[],
  seed: number,
  count: number,
): Promise<{ run: GhostRun; outcomes: readonly VariantOutcome[] }> {
  const rec = recording(executor);
  const run = await runGhostHand({
    plan,
    wardSet,
    variantConfig,
    seed,
    variantCount: count,
    world,
    executor: rec.executor,
    evidence: { selfCheck: { state: 'pending' }, capabilities: caps },
  });
  return { run, outcomes: rec.outcomes() };
}

async function holds(
  plan: readonly GhostHandAction[],
  seed: number,
  count: number,
  workers: number,
  keys: readonly number[],
): Promise<void> {
  const a = await runWith(inline, plan, seed, count);
  const sim = simulatedPool(workers, keys);
  try {
    const b = await runWith(sim.executor, plan, seed, count);
    expect(b.outcomes.map((o) => o.params)).toEqual(a.outcomes.map((o) => o.params));
    expect(b.outcomes.map((o) => o.trajectoryHash)).toEqual(a.outcomes.map((o) => o.trajectoryHash));
    expect(b.outcomes.map((o) => o.index)).toEqual(Array.from({ length: count }, (_, i) => i));
    expect(b.run.variantResults).toEqual(a.run.variantResults);
    expect(b.run).toEqual(a.run);
  } finally {
    sim.cleanup();
  }
  // Same seed and plan again on the inline executor: equal.
  const again = await runWith(inline, plan, seed, count);
  expect(again.outcomes.map((o) => o.trajectoryHash)).toEqual(a.outcomes.map((o) => o.trajectoryHash));
  expect(again.run).toEqual(a.run);
}

describe('Property 5: Variant determinism and partition independence', () => {
  it(
    'inline and simulated-pool runs give equal params, results, trajectory hashes, and GhostRun',
    async () => {
      const started = Date.now();
      let runs = 0;
      await fc.assert(
        fc.asyncProperty(planArb, seedArb, countArb, workersArb, orderArb, async (plan, seed, count, workers, keys) => {
          runs += 1;
          await holds(plan, seed, count, workers, keys);
        }),
        { numRuns: RUNS },
      );
      console.log(`p05: ${runs} property executions in ${Date.now() - started} ms`);
    },
    PBT_MODE === 'nightly' ? 0 : 900_000,
  );

  it('fixed example: 20 variants, 4 workers, reversed-looking completion order', async () => {
    await holds([{ type: 'reach', target: [0, 0.2, 0.18], speed: 0.4 }, { type: 'release' }], 12345, 20, 4, [1, 0, 2, 1, 0]);
  }, 300_000);

  it('fixed example: one variant, one worker', async () => {
    await holds([{ type: 'grasp', force: 2 }], 0, 1, 1, [0]);
  }, 120_000);
});
