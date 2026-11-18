/**
 * Deterministic controller of the four actions: reach, grasp, pull, release.
 * Arithmetic: + - * /, comparisons, square root, min, max, abs, floor, ceil (Requirement 5.6).
 * No trigonometry, no power function, no random source, no clock. Angles come from the engine.
 *
 * The caller loads `s.integration` into the entry (engine.load) before calling `runAction`, and
 * calls `runAction` for consecutive actions without a reload when it runs a continuous reference.
 * `runAction` never throws for the content of the action or the state; a failed outcome means the
 * caller keeps `s`. After a failed outcome the entry data is not meaningful: reload before reuse.
 */
import { solveIk } from './ik.js';
import type { HandPose, IkSpec } from './ik.js';
import { u32ToUnit, xorshift32 } from './prng.js';
import { ARM_JOINTS, WORLD_CONFIG } from './world-config.js';
import type { Engine, EngineEntry, StepProbe } from './engine/engine.js';
import type { ControllerState, GhostHandAction, GhostHandState, RunMonitors, Vec3 } from './types.js';

export interface RunOptions {
  readonly recordFrames: boolean;
  readonly recordTrajectory: boolean;
}

export interface ActionOutcome {
  readonly ok: boolean;
  readonly error?: string;
  readonly noop?: 'precondition-not-met';
  /** Built from the engine capture and the loop accumulators; for a no-op it is `s` itself. */
  readonly next?: GhostHandState;
  /** Monitors up to the failure (the monitors of `s` plus the steps that ran). */
  readonly partialMonitors: RunMonitors;
  /** one pose vector (POSE_STRIDE floats per body) per frame, one frame every frameStrideSteps steps and one at the end. */
  readonly frames?: Float32Array;
  /** qpos then qvel of every simulated step. */
  readonly trajectory?: Float64Array;
}

/** Duration of the finger force ramp of a grasp, seconds. */
export const GRASP_RAMP_S = 0.1;
/** Time the arm keeps still after the sensed drawer displacement reached the pull distance, seconds. */
export const PULL_STOP_S = 0.1;
/** Fixed opening force of a release, newtons (negative: toward the open stop). Also holds open fingers at the stop. */
export const RELEASE_OPEN_FORCE_N = -5;

/** Hand pitch (sum of the three pitch hinges) that the inverse kinematics prefers: the hand points along -y, level. */
export const PREFERRED_HAND_PITCH_RAD = 1.5707963267948966;
const POSTURE_GAIN = 0.5;

const DT = WORLD_CONFIG.timeStepS;
const EPS = 1e-9;

/** Whole steps in a duration: the ceiling, with a tiny tolerance against binary rounding of the division. */
function stepsCeil(seconds: number): number {
  return Math.ceil(seconds / DT - EPS);
}

/** Whole steps of a limit in seconds, rounded to the nearest integer. */
function stepsLimit(seconds: number): number {
  return Math.floor(seconds / DT + 0.5);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function fail(error: string, partialMonitors: RunMonitors): ActionOutcome {
  return { ok: false, error, partialMonitors };
}

function mergeTouched(a: readonly string[], extra: ReadonlySet<string>): readonly string[] {
  if (extra.size === 0) return a;
  const all = new Set<string>(a);
  for (const e of extra) all.add(e);
  return [...all].sort();
}

type Advance = { readonly ok: true; readonly probe: StepProbe; readonly noise: number } | { readonly ok: false };

/** Mutable loop state of one action: delay ring, noise generator, monitors, and recorders. */
class Sim {
  private readonly ring: number[];
  private head: number;
  private prng: number;
  private readonly size: number;
  private readonly slot: number;
  private readonly touched = new Set<string>();
  private maxForce: number;
  private limitSteps: number;
  private selfSteps: number;
  private executed = 0;
  private readonly frames: Float32Array[] = [];
  private readonly trajectory: Float64Array[] = [];
  private lastFrameAt = -1;

  constructor(
    private readonly engine: Engine,
    private readonly entry: EngineEntry,
    private readonly s: GhostHandState,
    private readonly opts: RunOptions,
  ) {
    this.slot = s.controller.jointTarget.length + 1;
    this.size = s.variant.commandDelaySteps + 1;
    this.ring = [...s.delayBuffer];
    this.head = s.delayHead;
    this.prng = s.prng >>> 0;
    this.maxForce = s.monitors.maxContactForceN;
    this.limitSteps = s.monitors.jointLimitSteps;
    this.selfSteps = s.monitors.selfCollisionSteps;
  }

  /** Null when the state can drive the loop, otherwise a description of what is wrong. */
  check(): string | null {
    const delay = this.s.variant.commandDelaySteps;
    if (!Number.isInteger(delay) || delay < 0) return 'invalid state: command delay';
    if (this.ring.length !== this.size * this.slot) return 'invalid state: delay buffer';
    if (!Number.isInteger(this.head) || this.head < 0 || this.head >= this.size) return 'invalid state: delay head';
    if (this.engine.layout.ctrl.length !== this.slot + 1) return 'invalid state: control vector';
    return null;
  }

  get stepCount(): number {
    return this.executed;
  }

  /** One simulated step: delay ring, mj_step, monitors, one noise draw, recorders. */
  advance(joints: readonly number[], force: number): Advance {
    const { slot, size } = this;
    const write = this.head * slot;
    for (let k = 0; k < slot - 1; k += 1) this.ring[write + k] = joints[k] as number;
    this.ring[write + slot - 1] = force;
    const read = ((this.head + 1) % size) * slot; // the command issued `delay` steps ago
    this.head = (this.head + 1) % size;
    const ctrl = new Float64Array(slot + 1);
    for (let k = 0; k < slot - 1; k += 1) ctrl[k] = this.ring[read + k] as number;
    const delayed = this.ring[read + slot - 1] as number;
    // Open fingers are held against the open stop; a closing force is applied as it is.
    const applied = delayed > 0 ? delayed : RELEASE_OPEN_FORCE_N;
    ctrl[slot - 1] = applied;
    ctrl[slot] = applied;

    const probe = this.engine.step(this.entry, ctrl);
    // One noise draw per step, whatever the action: the generator depends only on the step count.
    this.prng = xorshift32(this.prng);
    const noise = 2 * u32ToUnit(this.prng) - 1;
    if (!probe.finite) return { ok: false };

    this.executed += 1;
    if (probe.maxArmContactForceN > this.maxForce) this.maxForce = probe.maxArmContactForceN;
    for (const name of probe.touched) this.touched.add(name);
    if (probe.jointLimitExceeded) this.limitSteps += 1;
    if (probe.selfCollision) this.selfSteps += 1;
    if (this.opts.recordTrajectory) this.trajectory.push(probe.qposQvel);
    if (this.opts.recordFrames && this.executed % WORLD_CONFIG.frameStrideSteps === 0) this.recordFrame();
    return { ok: true, probe, noise };
  }

  private recordFrame(): void {
    const { poses } = this.engine.capture(this.entry);
    this.frames.push(Float32Array.from(poses));
    this.lastFrameAt = this.executed;
  }

  monitors(): RunMonitors {
    const m = this.s.monitors;
    return {
      maxContactForceN: this.maxForce,
      touched: mergeTouched(m.touched, this.touched),
      jointLimitExceeded: m.jointLimitExceeded || this.limitSteps > m.jointLimitSteps,
      jointLimitSteps: this.limitSteps,
      selfCollisionOccurred: m.selfCollisionOccurred || this.selfSteps > m.selfCollisionSteps,
      selfCollisionSteps: this.selfSteps,
    };
  }

  failure(error: string): ActionOutcome {
    return fail(error, this.monitors());
  }

  finish(controller: ControllerState): ActionOutcome {
    if (this.opts.recordFrames && this.lastFrameAt !== this.executed) this.recordFrame();
    const { integration, poses } = this.engine.capture(this.entry);
    const next: GhostHandState = {
      ...this.s,
      steps: this.s.steps + this.executed,
      integration,
      poses,
      controller,
      prng: this.prng,
      delayBuffer: this.ring,
      delayHead: this.head,
      monitors: this.monitors(),
    };
    const outcome: {
      ok: boolean;
      next: GhostHandState;
      partialMonitors: RunMonitors;
      frames?: Float32Array;
      trajectory?: Float64Array;
    } = { ok: true, next, partialMonitors: next.monitors };
    if (this.opts.recordFrames) outcome.frames = concat32(this.frames, poses.length);
    if (this.opts.recordTrajectory) outcome.trajectory = concat64(this.trajectory);
    return outcome;
  }
}

function concat32(parts: readonly Float32Array[], frameLength: number): Float32Array {
  const out = new Float32Array(parts.length * frameLength);
  parts.forEach((p, i) => out.set(p, i * frameLength));
  return out;
}

function concat64(parts: readonly Float64Array[]): Float64Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Float64Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Checks the per-action and per-plan limits for a planned step count; returns the error text or null. */
function limitError(plannedSteps: number, stepsSoFar: number): string | null {
  if (plannedSteps > stepsLimit(WORLD_CONFIG.perActionLimitS)) return 'action exceeds time limit';
  if (stepsSoFar + plannedSteps > stepsLimit(WORLD_CONFIG.perPlanLimitS)) return 'plan exceeds time limit';
  return null;
}

/** Current arm hinge angles from the state vector. */
function currentQpos(engine: Engine, s: GhostHandState): Float64Array {
  const { qpos } = engine.layout;
  return s.integration.slice(qpos.offset, qpos.offset + qpos.length);
}

function ikSpec(engine: Engine, entry: EngineEntry): IkSpec {
  return {
    pose: (q: Float64Array): HandPose => engine.handKinematics(entry, q),
    jointQposIndex: engine.layout.armQposIndex,
    lower: ARM_JOINTS.map((j) => j.range[0]),
    upper: ARM_JOINTS.map((j) => j.range[1]),
    iterations: WORLD_CONFIG.ikIterations,
    damping: WORLD_CONFIG.ikDamping,
    posture: { weights: [0, 1, 1, 1], target: PREFERRED_HAND_PITCH_RAD, gain: POSTURE_GAIN },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Runs one action on the data that is already loaded in `entry` (which holds `s`).
 * Step counts are computed before any simulation; a limit error simulates nothing.
 */
export function runAction(engine: Engine, entry: EngineEntry, s: GhostHandState, a: GhostHandAction, opts: RunOptions): ActionOutcome {
  const noMonitors = s.monitors;
  const arm = ARM_JOINTS.length;
  if (s.controller.jointTarget.length !== arm) return fail('invalid state: controller', noMonitors);
  const sim = new Sim(engine, entry, s, opts);
  const stateProblem = sim.check();
  if (stateProblem !== null) return fail(stateProblem, noMonitors);

  switch (a.type) {
    case 'reach':
      return reach(engine, entry, s, sim, a.target, a.speed);
    case 'grasp':
      return grasp(engine, s, sim, a.force);
    case 'pull':
      return pull(engine, entry, s, sim, a.distance, a.speed);
    case 'release':
      return release(s, sim);
  }
}

function reach(engine: Engine, entry: EngineEntry, s: GhostHandState, sim: Sim, target: Vec3, speed: number): ActionOutcome {
  const q0 = currentQpos(engine, s);
  const here = engine.handKinematics(entry, q0).position;
  const dx = target[0] - (here[0] as number);
  const dy = target[1] - (here[1] as number);
  const dz = target[2] - (here[2] as number);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const n = Math.max(stepsCeil(WORLD_CONFIG.minMoveS), stepsCeil(distance / speed));
  const limit = limitError(n, s.steps);
  if (limit !== null) return fail(limit, s.monitors);

  const goal = solveIk(ikSpec(engine, entry), q0, [target[0], target[1], target[2]]);
  const from = s.controller.jointTarget;
  let joints: number[] = [...from];
  for (let k = 1; k <= n; k += 1) {
    const w = smoothstep(k / n);
    joints = from.map((v, j) => lerp(v, goal[j] as number, w));
    if (!sim.advance(joints, s.controller.fingerForceN).ok) return sim.failure('simulation unstable');
  }
  return sim.finish({ ...s.controller, jointTarget: joints });
}

function fingersHoldHandle(engine: Engine, probe: StepProbe): boolean {
  if (!probe.touched.includes('handle')) return false;
  // A finger that met no handle runs to its stop; a finger that holds the handle stays short of it.
  const travel = 0.02 - 1e-4;
  for (const idx of engine.layout.fingerQposIndex) {
    const v = probe.qposQvel[idx] as number;
    if (!(v < travel)) return false;
  }
  return true;
}

function grasp(engine: Engine, s: GhostHandState, sim: Sim, force: number): ActionOutcome {
  const ramp = stepsCeil(GRASP_RAMP_S);
  const hold = stepsCeil(WORLD_CONFIG.graspSettleS);
  const n = ramp + hold;
  const limit = limitError(n, s.steps);
  if (limit !== null) return fail(limit, s.monitors);

  const joints = s.controller.jointTarget;
  let last: StepProbe | undefined;
  for (let k = 1; k <= n; k += 1) {
    const f = k < ramp ? (force * k) / ramp : force;
    const r = sim.advance(joints, f);
    if (!r.ok) return sim.failure('simulation unstable');
    last = r.probe;
  }
  const holding = last !== undefined && fingersHoldHandle(engine, last);
  return sim.finish({ jointTarget: [...joints], fingerForceN: force, holding });
}

function pull(engine: Engine, entry: EngineEntry, s: GhostHandState, sim: Sim, distance: number, speed: number): ActionOutcome {
  if (!s.controller.holding) return { ok: true, noop: 'precondition-not-met', next: s, partialMonitors: s.monitors };
  const total = distance + WORLD_CONFIG.pullOvershootM;
  const n = stepsCeil(total / speed);
  const stop = stepsCeil(PULL_STOP_S);
  const limit = limitError(n + stop, s.steps); // worst case: the stop starts at the last planned step
  if (limit !== null) return fail(limit, s.monitors);

  const q0 = currentQpos(engine, s);
  const here = engine.handKinematics(entry, q0).position;
  const spec = ikSpec(engine, entry);
  const waypoints: number[][] = [];
  const count = WORLD_CONFIG.pullWaypoints;
  let seed = q0;
  for (let i = 1; i <= count; i += 1) {
    const goal = solveIk(spec, seed, [here[0] as number, (here[1] as number) + (total * i) / count, here[2] as number]);
    waypoints.push(goal);
    seed = Float64Array.from(seed);
    engine.layout.armQposIndex.forEach((idx, j) => {
      seed[idx] = goal[j] as number;
    });
  }

  const drawerIdx = engine.layout.drawerQposIndex;
  const drawerStart = s.integration[engine.layout.qpos.offset + drawerIdx] as number;
  const from = s.controller.jointTarget;
  let joints: number[] = [...from];
  let frozen = false;
  let stopLeft = stop;
  let k = 0;
  while (k < n || frozen) {
    if (!frozen) {
      k += 1;
      const u = (k / n) * count;
      const seg = Math.min(count - 1, Math.floor(u));
      const frac = u - seg;
      const a0 = seg === 0 ? from : (waypoints[seg - 1] as number[]);
      const a1 = waypoints[seg] as number[];
      joints = a0.map((v, j) => lerp(v, a1[j] as number, frac));
    }
    const r = sim.advance(joints, s.controller.fingerForceN);
    if (!r.ok) return sim.failure('simulation unstable');
    if (frozen) {
      stopLeft -= 1;
      if (stopLeft <= 0) break;
      continue;
    }
    const sensed = (r.probe.qposQvel[drawerIdx] as number) - drawerStart + r.noise * s.variant.sensorNoiseM;
    if (sensed >= distance) frozen = true; // commanded joint targets stay at `joints` from here on
  }
  return sim.finish({ ...s.controller, jointTarget: joints });
}

function release(s: GhostHandState, sim: Sim): ActionOutcome {
  if (!s.controller.holding) return { ok: true, noop: 'precondition-not-met', next: s, partialMonitors: s.monitors };
  const n = stepsCeil(WORLD_CONFIG.releaseSettleS);
  const limit = limitError(n, s.steps);
  if (limit !== null) return fail(limit, s.monitors);
  for (let k = 1; k <= n; k += 1) {
    if (!sim.advance(s.controller.jointTarget, 0).ok) return sim.failure('simulation unstable');
  }
  return sim.finish({ jointTarget: [...s.controller.jointTarget], fingerForceN: 0, holding: false });
}
