/** The initial state of the Base_World: arm at the home pose, drawer closed, vase at rest on the cabinet. */
import { RELEASE_OPEN_FORCE_N } from './controller.js';
import { NOMINAL_MODEL_PARAMS } from './engine/engine.js';
import type { Engine } from './engine/engine.js';
import { applyVariant, BASE_VARIANT_PARAMS } from './variant.js';
import type { GhostHandState, RunMonitors } from './types.js';

/** Home pose of the four arm hinges (radians). The three pitch hinges sum to the preferred hand pitch (pi / 2). */
export const HOME_ARM_POSE: readonly number[] = [0, 0.2, 1.0, 0.37];

export function emptyMonitors(): RunMonitors {
  return {
    maxContactForceN: 0,
    touched: [],
    jointLimitExceeded: false,
    jointLimitSteps: 0,
    selfCollisionOccurred: false,
    selfCollisionSteps: 0,
  };
}

/** Builds the Base_World initial state with the engine (fresh data, home pose, base variant, open fingers). */
export function createInitialState(engine: Engine): GhostHandState {
  const entry = engine.entry(NOMINAL_MODEL_PARAMS);
  const ctrl = new Float64Array(engine.layout.ctrl.length);
  HOME_ARM_POSE.forEach((q, k) => {
    ctrl[k] = q;
  });
  ctrl[HOME_ARM_POSE.length] = RELEASE_OPEN_FORCE_N;
  ctrl[HOME_ARM_POSE.length + 1] = RELEASE_OPEN_FORCE_N;
  const { integration, poses } = engine.initial(entry, HOME_ARM_POSE, ctrl);
  const base: GhostHandState = {
    schema: 1,
    variant: BASE_VARIANT_PARAMS,
    steps: 0,
    integration,
    poses,
    controller: { jointTarget: [...HOME_ARM_POSE], fingerForceN: 0, holding: false },
    prng: BASE_VARIANT_PARAMS.noiseSeed >>> 0,
    delayBuffer: [],
    delayHead: 0,
    monitors: emptyMonitors(),
  };
  return structuredClone(applyVariant(base, BASE_VARIANT_PARAMS));
}
