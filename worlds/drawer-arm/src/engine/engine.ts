import { WORLD_CONFIG } from '../world-config.js';
import { buildMjcf, modelKey, NOMINAL_MODEL_PARAMS, SCENE_NAMES } from './mjcf.js';
import type { ModelParams } from './mjcf.js';
import { EMPTY_SCAN, buildGeomTable, buildJointLimits, jointLimitExceeded, scanContacts } from './monitors.js';
import type { GeomTable, JointLimits } from './monitors.js';
import { readArray, withScope, writeArray } from './memory.js';
import type { Scope } from './memory.js';
import type { MjData, MjModel, MuJoCoModule } from './mujoco-subset.js';

export { EngineMemoryError, Scope, readArray, withScope, writeArray } from './memory.js';
export type { EngineMemoryErrorCode } from './memory.js';
export { buildMjcf, modelKey, NOMINAL_MODEL_PARAMS, SCENE_NAMES } from './mjcf.js';
export type { ModelParams } from './mjcf.js';

/** Most compiled models kept at once; the least recently used one is deleted when the limit is passed. */
export const MODEL_CACHE_LIMIT = 24;

/** Values per body in `poses`: position (3) and quaternion (4, w first). */
export const POSE_STRIDE = 7;

/** The single-bit state signatures in bit order (mjtState); the vector layout follows this order. */
const STATE_BITS = [
  'TIME',
  'QPOS',
  'QVEL',
  'ACT',
  'HISTORY',
  'WARMSTART',
  'CTRL',
  'QFRC_APPLIED',
  'XFRC_APPLIED',
  'EQ_ACTIVE',
  'MOCAP_POS',
  'MOCAP_QUAT',
  'USERDATA',
  'PLUGIN',
  'PLASTIC',
] as const;

/** Warning counters that mean instability: BADQPOS, BADQVEL, BADQACC, BADCTRL (probe indices 3 to 6). */
const INSTABILITY_WARNINGS = [3, 4, 5, 6] as const;

interface Slice {
  readonly offset: number;
  readonly length: number;
}

/** Offsets and lengths inside the mjSTATE_INTEGRATION vector, computed from mj_stateSize (never hard-coded). */
export interface StateLayout {
  readonly total: number;
  /** Index of the simulation time inside the vector. */
  readonly time: number;
  readonly qpos: Slice;
  readonly qvel: Slice;
  readonly warmstart: Slice;
  readonly ctrl: Slice;
  /** Index of the drawer slide joint inside qpos. */
  readonly drawerQposIndex: number;
  /** Offset of the vase free joint inside qpos (7 values: position (3) and quaternion (4)). */
  readonly vaseQposOffset: number;
  readonly armQposIndex: readonly number[];
  readonly armDofIndex: readonly number[];
  readonly fingerQposIndex: readonly number[];
  /** Body names in model order (index 0 is the world body); `poses` holds POSE_STRIDE values per body. */
  readonly bodyNames: readonly string[];
}

export interface EngineEntry {
  /** The exact text of the model parameters. */
  readonly key: string;
  /** True once the entry was evicted from the cache or the engine was disposed. */
  readonly disposed: boolean;
}

export interface StepProbe {
  /** False when an instability counter rose during the step or a value is not finite. */
  readonly finite: boolean;
  /** Rise of the instability counters (BADQPOS, BADQVEL, BADQACC, BADCTRL) during the step. */
  readonly warnings: number;
  readonly maxArmContactForceN: number;
  readonly touched: readonly string[];
  readonly jointLimitExceeded: boolean;
  readonly selfCollision: boolean;
  /** qpos followed by qvel, copied; for the trajectory hash. */
  readonly qposQvel: Float64Array;
}

export interface HandKinematics {
  /** Hand site position in the world frame. */
  readonly position: Float64Array;
  /** 3 by 4 row-major position Jacobian of the hand site with respect to the four arm hinges. */
  readonly jacobian: Float64Array;
}

export interface EngineMemory {
  readonly modelArenaBytes: number;
  readonly dataArenaBytes: number;
  /** Bytes of one MjData (arena plus buffer). */
  readonly dataBytes: number;
}

export interface Engine {
  readonly layout: StateLayout;
  /** Cached; compiles on a miss. At most MODEL_CACHE_LIMIT entries live; an evicted entry is deleted. */
  entry(params: ModelParams): EngineEntry;
  /** mj_setState with mjSTATE_INTEGRATION. */
  load(entry: EngineEntry, integration: Float64Array): void;
  /**
   * The state vector of a freshly reset model with the arm hinges at `armQpos` and the control vector `ctrl`
   * (mj_resetData, then mj_forward), plus its body poses. Replaces the data of the entry.
   */
  initial(entry: EngineEntry, armQpos: readonly number[], ctrl: Float64Array): { integration: Float64Array; poses: Float64Array };
  /** The current state vector and the body poses (mj_kinematics runs first). */
  capture(entry: EngineEntry): { integration: Float64Array; poses: Float64Array };
  /** One mj_step with `ctrl` applied. */
  step(entry: EngineEntry, ctrl: Float64Array): StepProbe;
  /** Pose and Jacobian of the hand site for a full qpos vector, computed on the scratch data (main data untouched). */
  handKinematics(entry: EngineEntry, qpos: Float64Array): HandKinematics;
  memory(entry: EngineEntry): EngineMemory;
  /** Byte length of the module heap. */
  heapBytes(): number;
  /** Number of live cached entries. */
  cacheSize(): number;
  /** Idempotent. Deletes every cached entry; the module itself is never deleted. */
  dispose(): void;
}

function single(mujoco: MuJoCoModule, name: string): number {
  const e = mujoco.mjtState[`mjSTATE_${name}`];
  if (e === undefined) throw new Error(`mjSTATE_${name} is missing`);
  return e.value;
}

function objectType(mujoco: MuJoCoModule, name: string): number {
  const e = mujoco.mjtObj[name];
  if (e === undefined) throw new Error(`${name} is missing`);
  return e.value;
}

function jointId(mujoco: MuJoCoModule, model: MjModel, name: string): number {
  const id = mujoco.mj_name2id(model, objectType(mujoco, 'mjOBJ_JOINT'), name);
  if (id < 0) throw new Error(`joint "${name}" is not in the model`);
  return id;
}

/** One compiled model with its main data and the scratch data for inverse kinematics. */
class Entry implements EngineEntry {
  readonly key: string;
  readonly model: MjModel;
  readonly data: MjData;
  readonly scratch: MjData;
  readonly geoms: GeomTable;
  readonly limits: JointLimits;
  readonly handSiteId: number;
  /** Sum of the instability counters after the last step (they are never cleared by mj_step). */
  warningBaseline = 0;
  private alive = true;

  private constructor(key: string, model: MjModel, data: MjData, scratch: MjData, geoms: GeomTable, limits: JointLimits, handSiteId: number) {
    this.key = key;
    this.model = model;
    this.data = data;
    this.scratch = scratch;
    this.geoms = geoms;
    this.limits = limits;
    this.handSiteId = handSiteId;
  }

  get disposed(): boolean {
    return !this.alive;
  }

  static compile(mujoco: MuJoCoModule, params: ModelParams): Entry {
    const key = modelKey(params);
    const model = mujoco.MjModel.from_xml_string(buildMjcf(params));
    let data: MjData | undefined;
    let scratch: MjData | undefined;
    try {
      data = new mujoco.MjData(model);
      scratch = new mujoco.MjData(model);
      const geoms = buildGeomTable(mujoco, model);
      const limits = buildJointLimits(mujoco, model, SCENE_NAMES.armJoints, WORLD_CONFIG.jointLimitToleranceRad);
      const site = mujoco.mj_name2id(model, objectType(mujoco, 'mjOBJ_SITE'), SCENE_NAMES.handSite);
      if (site < 0) throw new Error('hand site is missing');
      return new Entry(key, model, data, scratch, geoms, limits, site);
    } catch (error) {
      for (const owned of [scratch, data, model]) {
        try {
          owned?.delete();
        } catch {
          // keep the first error
        }
      }
      throw error;
    }
  }

  /** Deletes scratch data, main data, and model once. */
  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    let failed = false;
    let first: unknown;
    for (const owned of [this.scratch, this.data, this.model]) {
      try {
        owned.delete();
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
    if (failed) throw first;
  }
}

function computeLayout(mujoco: MuJoCoModule, entry: Entry): StateLayout {
  const { model } = entry;
  const sizes = STATE_BITS.map((bit) => mujoco.mj_stateSize(model, single(mujoco, bit)));
  const offsets: number[] = [];
  let running = 0;
  for (const s of sizes) {
    offsets.push(running);
    running += s;
  }
  const total = running;
  const integrationSize = mujoco.mj_stateSize(model, single(mujoco, 'INTEGRATION'));
  if (total !== integrationSize) throw new Error(`state layout mismatch: bits sum to ${total}, INTEGRATION has ${integrationSize}`);
  const slice = (bit: (typeof STATE_BITS)[number]): Slice => {
    const k = STATE_BITS.indexOf(bit);
    return { offset: offsets[k] as number, length: sizes[k] as number };
  };
  const qposAdr = readArray(model, 'jnt_qposadr', model.njnt);
  const dofAdr = readArray(model, 'jnt_dofadr', model.njnt);
  const qposOf = (name: string): number => qposAdr[jointId(mujoco, model, name)] as number;
  const bodyType = objectType(mujoco, 'mjOBJ_BODY');
  const bodyNames: string[] = [];
  for (let b = 0; b < model.nbody; b += 1) bodyNames.push(mujoco.mj_id2name(model, bodyType, b) ?? (b === 0 ? 'world' : `body${b}`));
  return {
    total,
    time: (offsets[0] as number),
    qpos: slice('QPOS'),
    qvel: slice('QVEL'),
    warmstart: slice('WARMSTART'),
    ctrl: slice('CTRL'),
    drawerQposIndex: qposOf(SCENE_NAMES.drawerJoint),
    vaseQposOffset: qposOf(SCENE_NAMES.vaseJoint),
    armQposIndex: SCENE_NAMES.armJoints.map(qposOf),
    armDofIndex: SCENE_NAMES.armJoints.map((n) => dofAdr[jointId(mujoco, model, n)] as number),
    fingerQposIndex: SCENE_NAMES.fingerJoints.map(qposOf),
    bodyNames,
  };
}

function sumInstability(data: MjData, scope: Scope): number {
  // data.warning is a non-owning reference (never deleted); get(i) returns an owning copy.
  const warning = data.warning;
  let sum = 0;
  for (const index of INSTABILITY_WARNINGS) {
    const stat = warning.get(index);
    if (stat === undefined) continue;
    scope.add(stat);
    sum += stat.number;
  }
  return sum;
}

export function createEngine(mujoco: MuJoCoModule): Engine {
  const cache = new Map<string, Entry>();
  let disposed = false;

  const integrationSig = single(mujoco, 'INTEGRATION');

  const insert = (params: ModelParams): Entry => {
    const created = Entry.compile(mujoco, params);
    cache.set(created.key, created);
    while (cache.size > MODEL_CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (oldest.done === true) break;
      const victim = cache.get(oldest.value);
      cache.delete(oldest.value);
      victim?.destroy();
    }
    return created;
  };

  const live = (entry: EngineEntry): Entry => {
    if (disposed) throw new Error('engine is disposed');
    if (!(entry instanceof Entry) || cache.get(entry.key) !== entry) throw new Error('engine entry was evicted or does not belong to this engine');
    return entry;
  };

  const base = insert(NOMINAL_MODEL_PARAMS);
  let layout: StateLayout;
  try {
    layout = computeLayout(mujoco, base);
  } catch (error) {
    cache.delete(base.key);
    base.destroy();
    throw error;
  }
  const lay = layout;
  const nq = base.model.nq;
  const nv = base.model.nv;
  const nu = base.model.nu;
  const nbody = base.model.nbody;
  const nsite = base.model.nsite;

  const captureOf = (e: Entry): { integration: Float64Array; poses: Float64Array } =>
    withScope((scope) => {
      const out = scope.add(new mujoco.DoubleBuffer(lay.total));
      mujoco.mj_getState(e.model, e.data, out, integrationSig);
      const integration = Float64Array.from(out.GetView());
      mujoco.mj_kinematics(e.model, e.data);
      const xpos = readArray(e.data, 'xpos', 3 * nbody);
      const xquat = readArray(e.data, 'xquat', 4 * nbody);
      const poses = new Float64Array(POSE_STRIDE * nbody);
      for (let b = 0; b < nbody; b += 1) {
        for (let k = 0; k < 3; k += 1) poses[POSE_STRIDE * b + k] = xpos[3 * b + k] as number;
        for (let k = 0; k < 4; k += 1) poses[POSE_STRIDE * b + 3 + k] = xquat[4 * b + k] as number;
      }
      return { integration, poses };
    });

  return {
    layout: lay,

    entry(params: ModelParams): EngineEntry {
      if (disposed) throw new Error('engine is disposed');
      const key = modelKey(params);
      const hit = cache.get(key);
      if (hit !== undefined) {
        cache.delete(key); // refresh the recency order
        cache.set(key, hit);
        return hit;
      }
      return insert(params);
    },

    load(entry: EngineEntry, integration: Float64Array): void {
      const e = live(entry);
      if (integration.length !== lay.total) throw new RangeError(`integration vector has length ${integration.length}, expected ${lay.total}`);
      mujoco.mj_setState(e.model, e.data, integration, integrationSig);
    },

    initial(entry: EngineEntry, armQpos: readonly number[], ctrl: Float64Array): { integration: Float64Array; poses: Float64Array } {
      const e = live(entry);
      if (armQpos.length !== lay.armQposIndex.length) throw new RangeError(`armQpos has length ${armQpos.length}, expected ${lay.armQposIndex.length}`);
      if (ctrl.length !== nu) throw new RangeError(`ctrl has length ${ctrl.length}, expected ${nu}`);
      mujoco.mj_resetData(e.model, e.data);
      const qpos = readArray(e.data, 'qpos', nq);
      lay.armQposIndex.forEach((idx, k) => {
        qpos[idx] = armQpos[k] as number;
      });
      writeArray(e.data, 'qpos', qpos);
      writeArray(e.data, 'ctrl', ctrl);
      mujoco.mj_forward(e.model, e.data);
      e.warningBaseline = withScope((scope) => sumInstability(e.data, scope));
      return captureOf(e);
    },

    capture(entry: EngineEntry): { integration: Float64Array; poses: Float64Array } {
      return captureOf(live(entry));
    },

    step(entry: EngineEntry, ctrl: Float64Array): StepProbe {
      const e = live(entry);
      if (ctrl.length !== nu) throw new RangeError(`ctrl has length ${ctrl.length}, expected ${nu}`);
      writeArray(e.data, 'ctrl', ctrl);
      mujoco.mj_step(e.model, e.data);
      return withScope((scope) => {
        const after = sumInstability(e.data, scope);
        const rise = after - e.warningBaseline;
        e.warningBaseline = after;
        const qpos = readArray(e.data, 'qpos', nq);
        const qvel = readArray(e.data, 'qvel', nv);
        const qposQvel = new Float64Array(nq + nv);
        qposQvel.set(qpos, 0);
        qposQvel.set(qvel, nq);
        let finite = rise <= 0;
        for (let i = 0; finite && i < qposQvel.length; i += 1) if (!Number.isFinite(qposQvel[i])) finite = false;
        if (!finite) {
          // mj_step reset the data itself: nothing in it describes the step, so report no contact facts.
          return { finite: false, warnings: rise, ...EMPTY_SCAN, jointLimitExceeded: false, selfCollision: false, qposQvel };
        }
        const scan = e.data.ncon > 0 ? scanContacts(mujoco, e.model, e.data, e.geoms, scope) : EMPTY_SCAN;
        return {
          finite: true,
          warnings: rise,
          maxArmContactForceN: scan.maxArmContactForceN,
          touched: scan.touched,
          jointLimitExceeded: jointLimitExceeded(e.limits, qpos),
          selfCollision: scan.selfCollision,
          qposQvel,
        };
      });
    },

    handKinematics(entry: EngineEntry, qpos: Float64Array): HandKinematics {
      const e = live(entry);
      if (qpos.length !== nq) throw new RangeError(`qpos has length ${qpos.length}, expected ${nq}`);
      writeArray(e.scratch, 'qpos', qpos);
      mujoco.mj_forward(e.model, e.scratch); // the Jacobian needs the full position stage, not only mj_kinematics
      const sitePos = readArray(e.scratch, 'site_xpos', 3 * nsite);
      const position = sitePos.slice(3 * e.handSiteId, 3 * e.handSiteId + 3);
      const jacobian = withScope((scope) => {
        const jacp = scope.add(new mujoco.DoubleBuffer(3 * nv));
        mujoco.mj_jacSite(e.model, e.scratch, jacp, null, e.handSiteId);
        const full = Float64Array.from(jacp.GetView());
        const out = new Float64Array(3 * lay.armDofIndex.length);
        for (let row = 0; row < 3; row += 1) {
          for (let k = 0; k < lay.armDofIndex.length; k += 1) out[row * lay.armDofIndex.length + k] = full[row * nv + (lay.armDofIndex[k] as number)] as number;
        }
        return out;
      });
      return { position, jacobian };
    },

    memory(entry: EngineEntry): EngineMemory {
      const e = live(entry);
      return { modelArenaBytes: e.model.narena, dataArenaBytes: e.data.narena, dataBytes: e.data.narena + e.data.nbuffer };
    },

    heapBytes(): number {
      // The module exports no HEAP views: read the byte length behind a fresh buffer view (probe).
      return withScope((scope) => scope.add(mujoco.DoubleBuffer.FromArray([0])).GetView().buffer.byteLength);
    },

    cacheSize(): number {
      return cache.size;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      let failed = false;
      let first: unknown;
      for (const e of cache.values()) {
        try {
          e.destroy();
        } catch (error) {
          if (!failed) {
            failed = true;
            first = error;
          }
        }
      }
      cache.clear();
      if (failed) throw first;
    },
  };
}
