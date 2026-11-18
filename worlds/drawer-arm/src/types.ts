export type Vec3 = readonly [number, number, number];

export type GhostHandAction =
  | { readonly type: 'reach'; readonly target: Vec3; readonly speed: number } // meters, meters per second
  | { readonly type: 'grasp'; readonly force: number } // newtons
  | { readonly type: 'pull'; readonly distance: number; readonly speed: number } // meters, meters per second
  | { readonly type: 'release' };

/** Perturbed values of one variant plus the derived noise seed. All finite. */
export interface VariantParams {
  readonly drawerFrictionN: number; // slide joint frictionloss, newtons
  readonly drawerMassKg: number;
  readonly handleOffsetM: Vec3; // added to the nominal handle position in the drawer frame
  readonly sensorNoiseM: number; // amplitude of the drawer displacement reading error
  readonly commandDelaySteps: number; // whole number of time steps
  readonly noiseSeed: number; // uint32, derived from (Seed, index); not a range field
}

export interface RunMonitors {
  readonly maxContactForceN: number; // max over contacts involving an Arm geom
  readonly touched: readonly string[]; // sorted Contact_Names touched by an Arm geom
  readonly jointLimitExceeded: boolean;
  readonly jointLimitSteps: number;
  readonly selfCollisionOccurred: boolean;
  readonly selfCollisionSteps: number;
}

export interface ControllerState {
  readonly jointTarget: readonly number[]; // commanded arm joint targets (before delay)
  readonly fingerForceN: number; // commanded closing force, 0 when open
  readonly holding: boolean; // both fingers touched the handle at the end of the last grasp
}

/** The state type S. Finite numbers, booleans, strings, plain arrays and objects, Float64Array only. */
export interface GhostHandState {
  readonly schema: 1;
  readonly variant: VariantParams;
  readonly steps: number; // integer count of mj_step calls since the initial state
  readonly integration: Float64Array; // mj_getState(mjSTATE_INTEGRATION)
  readonly poses: Float64Array; // derived: per body xpos (3) and xquat (4), for pure render
  readonly controller: ControllerState;
  readonly prng: number; // uint32 state of the noise generator
  readonly delayBuffer: readonly number[]; // flattened ring of commanded ctrl vectors
  readonly delayHead: number; // integer index into the ring
  readonly monitors: RunMonitors;
}
