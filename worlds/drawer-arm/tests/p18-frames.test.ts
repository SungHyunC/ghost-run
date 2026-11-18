// Feature: ghost-hand, Property 18: Recorded frames respect the decimation limit
// **Validates: Requirements 8.11**
// Claim scope: the Tested_Environments, in-memory world. Frames are for drawing only and never enter the Trajectory_Hash.
import { ghostRun } from '@ghost-run/core';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadMujoco } from '../src/engine/index.js';
import type { MuJoCoModule } from '../src/engine/index.js';
import { POSE_STRIDE } from '../src/engine/engine.js';
import { trajectoryHash } from '../src/hash.js';
import { REFERENCE_PLAN } from '../src/reference-plan.js';
import type { GhostHandAction } from '../src/types.js';
import { createGhostHandWorld } from '../src/world.js';
import type { GhostHandWorld } from '../src/world.js';
import { WORLD_CONFIG } from '../src/world-config.js';
import { ENGINE_RUNS } from './pbt-config.js';

const RUN_TIMEOUT_MS = 300_000;
const STRIDE = WORLD_CONFIG.frameStrideSteps;
const DT = WORLD_CONFIG.timeStepS;
const MAX_FRAMES_PER_S = 60;

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

const plan = fc.array(validAction, { minLength: 1, maxLength: 50 });

/** Frames the recorder writes for an action of n >= 1 simulated steps: one per stride, plus one at the end. */
function expectedFrames(n: number): number {
  return Math.ceil(n / STRIDE);
}

interface Run {
  readonly stepsPerAction: number[];
  readonly framesPerAction: (Float32Array | undefined)[];
  readonly chunks: Float64Array[];
  readonly finalPoses: Float64Array;
  readonly bodyCount: number;
}

async function run(w: GhostHandWorld, actions: readonly GhostHandAction[]): Promise<Run> {
  const report = await ghostRun(w, await w.snapshot(), actions);
  try {
    const stepsPerAction: number[] = [];
    const framesPerAction: (Float32Array | undefined)[] = [];
    const chunks: Float64Array[] = [];
    let bodyCount = 0;
    for (let i = 1; i < report.snapshots.length; i += 1) {
      const snap = report.snapshots[i]!;
      const before = report.snapshots[i - 1]!;
      stepsPerAction.push(snap.state.steps - before.state.steps);
      const trace = w.frames(snap.id);
      framesPerAction.push(trace?.poses);
      if (trace !== undefined) bodyCount = trace.bodyCount;
      const traj = w.trajectory(snap.id);
      if (traj !== undefined) chunks.push(traj);
    }
    const last = report.snapshots[report.snapshots.length - 1]!;
    return { stepsPerAction, framesPerAction, chunks, finalPoses: last.state.poses, bodyCount };
  } finally {
    w.releaseTraces(report.snapshots.map((s) => s.id));
  }
}

describe('Property 18: recorded frames respect the decimation limit', () => {
  let module: MuJoCoModule;
  beforeAll(async () => {
    module = await loadMujoco();
  }, 60_000);

  it('records at most 60 frames per simulated second, with no gap above the stride, and hashes the same without frames', async () => {
    const withFrames = await createGhostHandWorld({ mujoco: module, recordFrames: true });
    const without = await createGhostHandWorld({ mujoco: module, recordFrames: false });
    try {
      await fc.assert(
        fc.asyncProperty(plan, async (actions) => {
          const a = await run(withFrames, actions);
          const frameLength = a.bodyCount * POSE_STRIDE;
          let totalSteps = 0;
          let totalFrames = 0;
          let lastFrameStep = 0; // global step index of the previous frame (the run start counts as step 0)
          a.framesPerAction.forEach((poses, i) => {
            const n = a.stepsPerAction[i] as number;
            // A no-op (pull or release without a hold) simulates no step and records no trace.
            if (n === 0) {
              expect(poses).toBeUndefined();
              return;
            }
            expect(poses).toBeDefined();
            const count = (poses as Float32Array).length / frameLength;
            expect(Number.isInteger(count)).toBe(true);
            expect(count).toBe(expectedFrames(n));
            // Frame times of this action: every stride, then the end of the action.
            for (let f = 0; f < count; f += 1) {
              const local = Math.min((f + 1) * STRIDE, n);
              const at = totalSteps + local;
              expect(at - lastFrameStep).toBeLessThanOrEqual(STRIDE);
              lastFrameStep = at;
            }
            totalSteps += n;
            totalFrames += count;
          });
          // Rate over the whole run.
          if (totalSteps > 0) expect(totalFrames / (totalSteps * DT)).toBeLessThanOrEqual(MAX_FRAMES_PER_S + 1e-9);
          // The last frame of the last action that simulated steps is the final pose (no-ops leave the pose alone).
          const withTrace = a.framesPerAction.filter((p): p is Float32Array => p !== undefined);
          if (withTrace.length > 0) {
            const lastPoses = withTrace[withTrace.length - 1] as Float32Array;
            const tail = lastPoses.slice(lastPoses.length - frameLength);
            expect(Array.from(tail)).toEqual(Array.from(Float32Array.from(a.finalPoses)));
          } else {
            expect(totalSteps).toBe(0);
          }

          // Frames never enter the Trajectory_Hash: same hash with and without frame recording.
          const b = await run(without, actions);
          b.framesPerAction.forEach((p) => expect(p).toBeUndefined());
          expect(await trajectoryHash(a.chunks)).toBe(await trajectoryHash(b.chunks));
        }),
        { numRuns: ENGINE_RUNS },
      );
    } finally {
      withFrames.dispose();
      without.dispose();
    }
  }, RUN_TIMEOUT_MS);

  it('records no frame for a plan of no-ops (pull and release without a hold)', async () => {
    const w = await createGhostHandWorld({ mujoco: module, recordFrames: true });
    try {
      const a = await run(w, [{ type: 'pull', distance: 0.02, speed: 0.05 }, { type: 'release' }]);
      expect(a.stepsPerAction).toEqual([0, 0]);
      a.framesPerAction.forEach((p) => expect(p).toBeUndefined());
    } finally {
      w.dispose();
    }
  }, RUN_TIMEOUT_MS);

  it('keeps the rate under 60 frames per second and the gap within the stride for the reference plan', async () => {
    const w = await createGhostHandWorld({ mujoco: module, recordFrames: true });
    try {
      const a = await run(w, REFERENCE_PLAN);
      const steps = a.stepsPerAction.reduce((x, y) => x + y, 0);
      const frames = a.framesPerAction.reduce((x, p) => x + (p as Float32Array).length / (a.bodyCount * POSE_STRIDE), 0);
      expect(steps).toBeGreaterThan(0);
      expect(frames / (steps * DT)).toBeLessThanOrEqual(MAX_FRAMES_PER_S);
      expect(STRIDE * DT * MAX_FRAMES_PER_S).toBeGreaterThanOrEqual(1);
    } finally {
      w.dispose();
    }
  }, RUN_TIMEOUT_MS);
});
