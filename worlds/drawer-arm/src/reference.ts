/**
 * Reference execution: one engine entry, one load, then every action through the same runAction with no
 * restore between actions. Both this and the ghost (world.step, a restore at every action) share runAction,
 * capture, and diffStates; Property 20 compares the two.
 */
import type { Change } from '@ghost-run/core';
import { validateAction } from './actions.js';
import { runAction } from './controller.js';
import { diffStates } from './diff.js';
import { createEngine } from './engine/index.js';
import type { Engine, ModelParams, MuJoCoModule } from './engine/index.js';
import { trajectoryHash } from './hash.js';
import type { GhostHandAction, GhostHandState, VariantParams } from './types.js';

/** The model parameters of a variant: the only values that change the compiled model. */
export function modelParamsOf(v: VariantParams): ModelParams {
  return { drawerFrictionN: v.drawerFrictionN, drawerMassKg: v.drawerMassKg, handleOffsetM: v.handleOffsetM };
}

export interface ReferenceRun {
  /** Per-action changes, concatenated in action order. */
  readonly changes: Change[];
  readonly final: GhostHandState;
  /** One chunk per successful action: qpos then qvel of every step. */
  readonly chunks: Float64Array[];
  readonly frames: Float32Array[];
  /** Indices of actions that failed (state unchanged, no change emitted). */
  readonly failedActions: number[];
}

/** Synchronous continuous run of `plan` from `state` on `engine`. Does not modify `state`. */
export function runReference(engine: Engine, state: GhostHandState, plan: readonly GhostHandAction[], opts: { recordFrames: boolean }): ReferenceRun {
  const entry = engine.entry(modelParamsOf(state.variant));
  engine.load(entry, state.integration);
  const changes: Change[] = [];
  const chunks: Float64Array[] = [];
  const frames: Float32Array[] = [];
  const failedActions: number[] = [];
  let current = state;
  plan.forEach((action, index) => {
    const out = validateAction(action).ok ? runAction(engine, entry, current, action, { recordFrames: opts.recordFrames, recordTrajectory: true }) : undefined;
    if (out === undefined || !out.ok || out.next === undefined) {
      failedActions.push(index);
      // A failed action leaves the entry data meaningless: continue from the unchanged state.
      engine.load(entry, current.integration);
      return;
    }
    changes.push(...diffStates(current, out.next));
    if (out.trajectory !== undefined) chunks.push(out.trajectory);
    if (out.frames !== undefined) frames.push(out.frames);
    current = out.next;
  });
  return { changes, final: structuredClone(current), chunks, frames, failedActions };
}

export interface ReferenceExecution {
  readonly changes: Change[];
  readonly final: GhostHandState;
  readonly trajectoryHash: string;
}

export async function referenceExecute(engine: Engine, state: GhostHandState, plan: readonly GhostHandAction[]): Promise<ReferenceExecution> {
  const run = runReference(engine, structuredClone(state), plan, { recordFrames: false });
  return { changes: run.changes, final: run.final, trajectoryHash: await trajectoryHash(run.chunks) };
}

/** Structurally the `DeterministicTestAdapter` of `@ghost-run/core/verify`, plus `dispose`. */
export interface ReferenceTestAdapter {
  apply(state: GhostHandState, actions: readonly GhostHandAction[]): Change[];
  dispose(): void;
}

/**
 * Test adapter for P2: executes the actions on a structural clone of the state with its own engine (own model and
 * data objects built from the MJCF text), continuously and without the snapshot and restore code of the world.
 */
export function createReferenceTestAdapter(mujoco: MuJoCoModule): ReferenceTestAdapter {
  const engine = createEngine(mujoco);
  return {
    apply: (state, actions) => runReference(engine, structuredClone(state), actions, { recordFrames: false }).changes,
    dispose: () => {
      engine.dispose();
    },
  };
}
