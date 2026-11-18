import { createEngine } from '../../src/engine/engine.js';
import type { Engine, EngineEntry } from '../../src/engine/engine.js';
import { loadMujoco } from '../../src/engine/load.js';
import { runAction } from '../../src/controller.js';
import type { ActionOutcome, RunOptions } from '../../src/controller.js';
import type { GhostHandAction, GhostHandState, VariantParams } from '../../src/types.js';
import { applyVariant, BASE_VARIANT_PARAMS } from '../../src/variant.js';

/** Home pose of the arm hinges (radians). */
export const HOME_POSE: readonly number[] = [0, 0.2, 1.0, 0.37];

export const NO_RECORD: RunOptions = { recordFrames: false, recordTrajectory: false };

export async function makeEngine(): Promise<Engine> {
  return createEngine(await loadMujoco());
}

export function entryFor(engine: Engine, v: VariantParams): EngineEntry {
  return engine.entry({ drawerFrictionN: v.drawerFrictionN, drawerMassKg: v.drawerMassKg, handleOffsetM: v.handleOffsetM });
}

// The data of a cached entry is shared and dirty after a run, so the pristine integration vector of each
// model is captured once, the first time that model is asked for (before anything has run on it).
const pristine = new WeakMap<Engine, Map<string, Float64Array>>();

function pristineIntegration(engine: Engine, entry: EngineEntry): Float64Array {
  let perModel = pristine.get(engine);
  if (perModel === undefined) {
    perModel = new Map();
    pristine.set(engine, perModel);
  }
  let v = perModel.get(entry.key);
  if (v === undefined) {
    v = Float64Array.from(engine.capture(entry).integration);
    perModel.set(entry.key, v);
  }
  return Float64Array.from(v);
}

/** Base_World state at rest in the home pose, built from the engine (the test helper of the controller tests). */
export function initialState(engine: Engine, variant: VariantParams = BASE_VARIANT_PARAMS): GhostHandState {
  const entry = entryFor(engine, variant);
  const integration = pristineIntegration(engine, entry);
  const { qpos, armQposIndex } = engine.layout;
  armQposIndex.forEach((idx, k) => {
    integration[qpos.offset + idx] = HOME_POSE[k] as number;
  });
  engine.load(entry, integration);
  const { integration: settled, poses } = engine.capture(entry);
  const base: GhostHandState = {
    schema: 1,
    variant,
    steps: 0,
    integration: settled,
    poses,
    controller: { jointTarget: [...HOME_POSE], fingerForceN: 0, holding: false },
    prng: variant.noiseSeed,
    delayBuffer: [],
    delayHead: 0,
    monitors: {
      maxContactForceN: 0,
      touched: [],
      jointLimitExceeded: false,
      jointLimitSteps: 0,
      selfCollisionOccurred: false,
      selfCollisionSteps: 0,
    },
  };
  return applyVariant(base, variant);
}

/** Loads `s` into its entry and runs one action. */
export function run(engine: Engine, s: GhostHandState, a: GhostHandAction, opts: RunOptions = NO_RECORD): ActionOutcome {
  const entry = entryFor(engine, s.variant);
  engine.load(entry, s.integration);
  return runAction(engine, entry, s, a, opts);
}

/** Hand site position for the arm pose stored in `s`. */
export function handPosition(engine: Engine, s: GhostHandState): readonly number[] {
  const entry = entryFor(engine, s.variant);
  const { qpos } = engine.layout;
  const q = s.integration.slice(qpos.offset, qpos.offset + qpos.length);
  return Array.from(engine.handKinematics(entry, q).position);
}

export function drawerOpening(engine: Engine, s: GhostHandState): number {
  return s.integration[engine.layout.qpos.offset + engine.layout.drawerQposIndex] as number;
}

