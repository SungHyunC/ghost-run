// Feature: ghost-hand, Property 12: No state is carried between runs (GH-P12)
// **Validates: Requirements 3.14, 3.15, 17.9**
// Claim scope: the Tested_Environments, per run, for the in-memory world (no hardware, no untracked state).
import { ghostRun } from '@ghost-run/core';
import type { GhostReport } from '@ghost-run/core';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMujoco } from '../src/engine/index.js';
import type { MuJoCoModule } from '../src/engine/index.js';
import { REFERENCE_PLAN } from '../src/reference-plan.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { createGhostHandWorld } from '../src/world.js';
import type { GhostHandWorld } from '../src/world.js';
import { ENGINE_RUNS } from './pbt-config.js';

const RUN_TIMEOUT_MS = 300_000;

// Valid actions inside the declared ranges (WORLD_CONFIG.actionRanges).
const num = (min: number, max: number): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((v) => v + 0);

const validAction: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc.record({
    type: fc.constant('reach' as const),
    target: fc.tuple(num(-0.3, 0.3), num(-0.3, 0.7), num(0.05, 0.7)),
    speed: num(0.05, 0.6),
  }),
  fc.record({ type: fc.constant('grasp' as const), force: num(2, 40) }),
  fc.record({ type: fc.constant('pull' as const), distance: num(0.02, 0.25), speed: num(0.05, 0.6) }),
  fc.constant({ type: 'release' as const }),
) as fc.Arbitrary<GhostHandAction>;

const targetPlan = fc.array(validAction, { minLength: 1, maxLength: 50 });

// Actions that make a step fail: out-of-range values (Property 13 territory) and slow reaches over the limit.
const failingAction: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc.constant({ type: 'grasp', force: 1000 } as GhostHandAction),
  fc.constant({ type: 'pull', distance: 5, speed: 0.1 } as GhostHandAction),
  fc.constant({ type: 'reach', target: [0, 0.7, 0.7], speed: 0.05 } as GhostHandAction),
  fc.constant({ type: 'reach', target: [Number.NaN, 0, 0.2], speed: 0.3 } as GhostHandAction),
);

// Other plans: a mix of valid and failing actions, so the long-lived world has seen failing runs.
const otherPlan = fc.array(fc.oneof(validAction, failingAction), { minLength: 1, maxLength: 12 });

/** Structural form with ids dropped, typed arrays as exact bytes and numbers by Object.is (-0 vs 0, NaN). */
function normalize(v: unknown): unknown {
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : Number.isNaN(v) ? 'NaN' : v;
  if (ArrayBuffer.isView(v)) {
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return `${v.constructor.name}:${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'object' && v !== null) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalize(x)]));
  }
  return v;
}

/** Report without snapshot ids (ids count up per world and are not part of the result). */
function comparable(r: GhostReport<GhostHandState>): unknown {
  return normalize({
    states: r.snapshots.map((s) => s.state),
    results: r.snapshots.map((s) => s.result),
    changes: r.changes,
    effectsOutside: r.effectsOutside,
  });
}

/**
 * Same loop as ghostRun, minus effectsOutside (which throws for an invalid action by contract), so that plans
 * with invalid actions reach step and fail there. ghostRun itself is used for the valid target plans below.
 */
async function runPlan(w: GhostHandWorld, plan: readonly GhostHandAction[]): Promise<GhostReport<GhostHandState>> {
  const start = await w.snapshot();
  const snapshots = [start];
  const changes = [];
  let current = start;
  for (const a of plan) {
    const next = await w.step(current, a);
    changes.push(w.diff(current, next));
    snapshots.push(next);
    current = next;
  }
  w.releaseTraces(snapshots.map((s) => s.id));
  return { snapshots, changes, effectsOutside: [], observedEvents: [], variantResults: [] };
}

async function runValidPlan(w: GhostHandWorld, plan: readonly GhostHandAction[]): Promise<GhostReport<GhostHandState>> {
  const report = await ghostRun(w, await w.snapshot(), plan);
  w.releaseTraces(report.snapshots.map((s) => s.id));
  return report;
}

describe('Property 12: no state is carried between runs', () => {
  let module: MuJoCoModule;
  beforeAll(async () => {
    module = await loadMujoco();
  }, 60_000);

  it('gives equal reports from a fresh world and from a long-lived world that ran other plans', async () => {
    const longLived = await createGhostHandWorld({ mujoco: module });
    try {
      await fc.assert(
        fc.asyncProperty(otherPlan, targetPlan, async (other, plan) => {
          await runPlan(longLived, other); // may contain failing steps
          const fresh = await createGhostHandWorld({ mujoco: module });
          try {
            const expected = comparable(await runValidPlan(fresh, plan));
            const actual = comparable(await runValidPlan(longLived, plan));
            expect(actual).toEqual(expected);
          } finally {
            fresh.dispose();
          }
        }),
        { numRuns: ENGINE_RUNS },
      );
    } finally {
      longLived.dispose();
    }
  }, RUN_TIMEOUT_MS);

  it('gives equal reports for a plan whose steps fail, after the long-lived world ran a failing plan', async () => {
    const failing: GhostHandAction[] = [
      { type: 'grasp', force: 1000 },
      { type: 'reach', target: [0, 0.3, 0.2], speed: 0.05 },
      ...REFERENCE_PLAN,
    ];
    const longLived = await createGhostHandWorld({ mujoco: module });
    const fresh = await createGhostHandWorld({ mujoco: module });
    try {
      const firstLong = await runPlan(longLived, failing);
      expect(firstLong.snapshots.some((s) => !s.result.success)).toBe(true);
      const again = await runPlan(longLived, failing);
      const base = await runPlan(fresh, failing);
      expect(comparable(again)).toEqual(comparable(base));
    } finally {
      longLived.dispose();
      fresh.dispose();
    }
  }, RUN_TIMEOUT_MS);

  it('leaves the WebAssembly heap after run 40 at the size after run 1 for a fixed plan', async () => {
    const w = await createGhostHandWorld({ mujoco: module });
    try {
      await runPlan(w, REFERENCE_PLAN);
      const first = w.heapBytes();
      let last = first;
      for (let run = 2; run <= 40; run += 1) {
        await runPlan(w, REFERENCE_PLAN);
        last = w.heapBytes();
      }
      expect(last).toBe(first);
    } finally {
      w.dispose();
    }
  }, RUN_TIMEOUT_MS);

  afterAll(() => {
    // The module is shared and owned by the loader; nothing to free here.
  });
});
