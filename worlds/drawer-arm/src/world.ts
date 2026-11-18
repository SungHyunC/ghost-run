/**
 * The Ghost Hand world: the six `World<S, A>` functions over the MuJoCo drawer arm, plus the adopt, trace, and
 * reference functions. The world holds the live Reference_State (changed only by referenceExecute and
 * resetReference) and per-snapshot trace stores that the pipeline releases after each run. Nothing else is
 * carried from one run to the next.
 */
import type { Change, Effect, FingerprintResult, Scene, Snapshot, World } from '@ghost-run/core';
import { validateAction } from './actions.js';
import { runAction } from './controller.js';
import { diffStates } from './diff.js';
import { createEngine, loadMujoco } from './engine/index.js';
import type { Engine, MuJoCoModule } from './engine/index.js';
import { fingerprintOf } from './fingerprint.js';
import { concatFrames, makeFrameTrace } from './frames.js';
import type { FrameTrace } from './frames.js';
import { trajectoryHash } from './hash.js';
import { createInitialState } from './initial-state.js';
import { layoutMismatch } from './layout.js';
import { modelParamsOf, runReference } from './reference.js';
import { renderScene } from './scene.js';
import type { GhostHandAction, GhostHandState, RunMonitors } from './types.js';

export type { FrameTrace } from './frames.js';

export interface GhostHandWorldOptions {
  /** Default: loadMujoco(). Ignored when `engine` is given. */
  readonly mujoco?: MuJoCoModule;
  /** Caller-owned when given (dispose() of the world then leaves it alone). */
  readonly engine?: Engine;
  /** Keep one pose trace per stepped snapshot (frame stride WORLD_CONFIG.frameStrideSteps). Default false. */
  readonly recordFrames?: boolean;
  /** Keep the qpos/qvel trace of every stepped snapshot for the trajectory hash. Default true. */
  readonly recordTrajectory?: boolean;
  /** Default: the initial state of the Base_World. */
  readonly initial?: GhostHandState;
}

export interface ReferenceResult {
  readonly changes: Change[];
  readonly final: GhostHandState;
  readonly trajectoryHash: string;
  /** Present when the world records frames: the poses of the whole reference run. */
  readonly frames?: FrameTrace;
}

export interface GhostHandWorld extends World<GhostHandState, GhostHandAction> {
  /** A new snapshot id for a clone of `state`; no engine call. */
  adopt(state: GhostHandState): Snapshot<GhostHandState>;
  frames(snapshotId: string): FrameTrace | undefined;
  failureMonitors(snapshotId: string): RunMonitors | undefined;
  stepNote(snapshotId: string): 'precondition-not-met' | undefined;
  /** qpos then qvel of every simulated step of the action that produced the snapshot (successful steps only). */
  trajectory(snapshotId: string): Float64Array | undefined;
  /** Frees the four trace stores for these snapshot ids. */
  releaseTraces(ids: readonly string[]): void;
  /** Advances the live Reference_State by a continuous run of `plan`. Never called by a ghost run. */
  referenceExecute(plan: readonly GhostHandAction[]): Promise<ReferenceResult>;
  resetReference(): Promise<void>;
  heapBytes(): number;
  /** Idempotent. */
  dispose(): void;
}

export async function createGhostHandWorld(opts: GhostHandWorldOptions = {}): Promise<GhostHandWorld> {
  let engine: Engine;
  let ownsEngine = false;
  if (opts.engine !== undefined) {
    engine = opts.engine;
  } else {
    engine = createEngine(opts.mujoco ?? (await loadMujoco()));
    ownsEngine = true;
  }
  const recordFrames = opts.recordFrames === true;
  const recordTrajectory = opts.recordTrajectory !== false;

  let initial: GhostHandState;
  try {
    const mismatch = layoutMismatch(engine.layout);
    if (mismatch !== null) throw new Error(mismatch);
    initial = opts.initial !== undefined ? structuredClone(opts.initial) : createInitialState(engine);
  } catch (error) {
    if (ownsEngine) engine.dispose();
    throw error;
  }

  let live: GhostHandState = structuredClone(initial);
  let counter = 0;
  let disposed = false;
  const frameStore = new Map<string, FrameTrace>();
  const failureStore = new Map<string, RunMonitors>();
  const noteStore = new Map<string, 'precondition-not-met'>();
  const trajectoryStore = new Map<string, Float64Array>();
  const bodyCount = engine.layout.bodyNames.length;

  const nextId = (): string => {
    counter += 1;
    return `s${String(counter)}`;
  };

  const failed = (id: string, state: GhostHandState, error: string, partial: RunMonitors): Snapshot<GhostHandState> => {
    failureStore.set(id, structuredClone(partial));
    return { id, state: structuredClone(state), result: { success: false, error } };
  };

  const world: GhostHandWorld = {
    snapshot(): Promise<Snapshot<GhostHandState>> {
      return Promise.resolve({ id: nextId(), state: structuredClone(live), result: { success: true } });
    },

    step(s: Snapshot<GhostHandState>, a: GhostHandAction): Promise<Snapshot<GhostHandState>> {
      const id = nextId();
      const state = s.state;
      const check = validateAction(a);
      if (!check.ok) return Promise.resolve(failed(id, state, `invalid action: ${check.error}`, state.monitors));
      if (!(state.integration instanceof Float64Array) || state.integration.length !== engine.layout.total) {
        return Promise.resolve(failed(id, state, 'invalid state: integration', state.monitors));
      }
      let entry;
      try {
        entry = engine.entry(modelParamsOf(state.variant));
      } catch (error) {
        if (error instanceof RangeError) return Promise.resolve(failed(id, state, 'invalid state: variant', state.monitors));
        throw error;
      }
      engine.load(entry, state.integration);
      const out = runAction(engine, entry, state, a, { recordFrames, recordTrajectory });
      if (!out.ok || out.next === undefined) {
        return Promise.resolve(failed(id, state, out.error ?? 'action failed', out.partialMonitors));
      }
      if (out.noop !== undefined) noteStore.set(id, out.noop);
      if (out.frames !== undefined) frameStore.set(id, makeFrameTrace(out.frames, bodyCount));
      if (out.trajectory !== undefined) trajectoryStore.set(id, out.trajectory);
      return Promise.resolve({ id, state: structuredClone(out.next), result: { success: true } });
    },

    diff(before: Snapshot<GhostHandState>, after: Snapshot<GhostHandState>): Change[] {
      return diffStates(before.state, after.state);
    },

    render(s: Snapshot<GhostHandState>): Scene {
      return renderScene(s.state);
    },

    fingerprint(): Promise<FingerprintResult> {
      return fingerprintOf(live);
    },

    effectsOutside(a: GhostHandAction): Effect[] {
      const check = validateAction(a);
      if (!check.ok) throw new Error(`invalid action: ${check.error}`);
      return [];
    },

    adopt(state: GhostHandState): Snapshot<GhostHandState> {
      return { id: nextId(), state: structuredClone(state), result: { success: true } };
    },

    frames: (id) => frameStore.get(id),
    failureMonitors: (id) => failureStore.get(id),
    stepNote: (id) => noteStore.get(id),
    trajectory: (id) => trajectoryStore.get(id),

    releaseTraces(ids: readonly string[]): void {
      for (const id of ids) {
        frameStore.delete(id);
        failureStore.delete(id);
        noteStore.delete(id);
        trajectoryStore.delete(id);
      }
    },

    async referenceExecute(plan: readonly GhostHandAction[]): Promise<ReferenceResult> {
      const run = runReference(engine, live, plan, { recordFrames });
      live = structuredClone(run.final);
      const hash = await trajectoryHash(run.chunks);
      const result: ReferenceResult = { changes: run.changes, final: run.final, trajectoryHash: hash };
      return recordFrames ? { ...result, frames: makeFrameTrace(concatFrames(run.frames), bodyCount) } : result;
    },

    resetReference(): Promise<void> {
      live = structuredClone(initial);
      return Promise.resolve();
    },

    heapBytes: () => engine.heapBytes(),

    dispose(): void {
      if (disposed) return;
      disposed = true;
      frameStore.clear();
      failureStore.clear();
      noteStore.clear();
      trajectoryStore.clear();
      if (ownsEngine) engine.dispose();
    },
  };
  return world;
}

export default function create(): Promise<GhostHandWorld> {
  return createGhostHandWorld();
}
