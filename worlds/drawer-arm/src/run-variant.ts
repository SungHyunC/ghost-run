/**
 * One variant job: pure function of (world, job), shared by the inline executor and the worker.
 * Reads no clock and no random source. The world holds no state between jobs: every trace is released at the end.
 */
import { ghostRun } from '@ghost-run/core';
import type { Snapshot } from '@ghost-run/core';
import { concatFrames } from './frames.js';
import { trajectoryHash } from './hash.js';
import { emptyMonitors } from './initial-state.js';
import { qposAt, STATIC_LAYOUT } from './layout.js';
import type { GhostHandWorld } from './world.js';
import { applyVariant } from './variant.js';
import type { GhostHandAction, GhostHandState, RunMonitors, VariantParams } from './types.js';

export interface VariantJob {
  readonly index: number;
  readonly params: VariantParams;
  /** The base snapshot state, before applyVariant. */
  readonly startState: GhostHandState;
  readonly actions: readonly GhostHandAction[];
  readonly recordFrames: boolean;
}

export interface VariantOutcome {
  readonly index: number;
  readonly params: VariantParams;
  readonly finalDrawerM: number;
  /** Final monitors combined with the partial monitors of failed steps. */
  readonly monitors: RunMonitors;
  /** Action indices whose snapshot result was a failure. */
  readonly failedSteps: readonly number[];
  /** Contact_Name -> first action index that touched it. */
  readonly firstTouch: Readonly<Record<string, number>>;
  readonly trajectoryHash: string;
  readonly frames?: Float32Array;
  readonly engineError?: string;
}

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

/**
 * Combines the final monitors with the partial monitors of the failed steps. A failed snapshot keeps the state
 * of its predecessor, so the steps that ran inside the failed action are partial minus the state's own count.
 */
export function foldMonitors(final: RunMonitors, failed: readonly { readonly base: RunMonitors; readonly partial: RunMonitors }[]): RunMonitors {
  let maxContactForceN = final.maxContactForceN;
  let touched = final.touched;
  let limitSteps = final.jointLimitSteps;
  let selfSteps = final.selfCollisionSteps;
  let limit = final.jointLimitExceeded;
  let self = final.selfCollisionOccurred;
  for (const { base, partial } of failed) {
    maxContactForceN = Math.max(maxContactForceN, partial.maxContactForceN);
    touched = union(touched, partial.touched);
    limitSteps += Math.max(0, partial.jointLimitSteps - base.jointLimitSteps);
    selfSteps += Math.max(0, partial.selfCollisionSteps - base.selfCollisionSteps);
    limit = limit || partial.jointLimitExceeded;
    self = self || partial.selfCollisionOccurred;
  }
  return {
    maxContactForceN,
    touched: [...touched],
    jointLimitExceeded: limit || limitSteps > 0,
    jointLimitSteps: limitSteps,
    selfCollisionOccurred: self || selfSteps > 0,
    selfCollisionSteps: selfSteps,
  };
}

export async function runVariantJob(world: GhostHandWorld, job: VariantJob): Promise<VariantOutcome> {
  const ids: string[] = [];
  try {
    const start = world.adopt(applyVariant(job.startState, job.params));
    ids.push(start.id);
    const report = await ghostRun(world, start, job.actions);
    const snaps: readonly Snapshot<GhostHandState>[] = report.snapshots;
    for (const s of snaps) ids.push(s.id);

    const failedSteps: number[] = [];
    const failures: { base: RunMonitors; partial: RunMonitors }[] = [];
    const firstTouch: Record<string, number> = {};
    const chunks: Float64Array[] = [];
    const frameParts: Float32Array[] = [];
    let seen = new Set<string>(start.state.monitors.touched);
    for (let i = 1; i < snaps.length; i += 1) {
      const snap = snaps[i] as Snapshot<GhostHandState>;
      const before = snaps[i - 1] as Snapshot<GhostHandState>;
      let after = snap.state.monitors;
      if (!snap.result.success) {
        failedSteps.push(i - 1);
        const partial = world.failureMonitors(snap.id) ?? snap.state.monitors;
        failures.push({ base: before.state.monitors, partial });
        after = partial;
      }
      for (const name of after.touched) {
        if (!seen.has(name)) firstTouch[name] = i - 1;
      }
      seen = new Set([...seen, ...after.touched]);
      const trace = world.trajectory(snap.id);
      if (trace !== undefined) chunks.push(trace);
      const frames = world.frames(snap.id);
      if (frames !== undefined) frameParts.push(frames.poses);
    }
    const last = snaps[snaps.length - 1] as Snapshot<GhostHandState>;
    const outcome: VariantOutcome = {
      index: job.index,
      params: job.params,
      finalDrawerM: qposAt(last.state, STATIC_LAYOUT.drawerQposIndex) ?? 0,
      monitors: foldMonitors(last.state.monitors, failures),
      failedSteps,
      firstTouch,
      trajectoryHash: await trajectoryHash(chunks),
    };
    return job.recordFrames ? { ...outcome, frames: concatFrames(frameParts) } : outcome;
  } catch (error) {
    return {
      index: job.index,
      params: job.params,
      finalDrawerM: 0,
      monitors: emptyMonitors(),
      failedSteps: [],
      firstTouch: {},
      trajectoryHash: '',
      engineError: error instanceof Error ? error.message : String(error),
    };
  } finally {
    world.releaseTraces(ids);
  }
}
