import { BODY_SHAPES } from '../world-config.js';
import type { DoubleBuffer, MjData, MjModel, MuJoCoModule } from './mujoco-subset.js';
import { SCENE_NAMES } from './mjcf.js';
import { readArray } from './memory.js';
import type { Scope } from './memory.js';

/** Per-geom classification, built once per compiled model. Indexed by geom id. */
export interface GeomTable {
  /** 1 when the geom belongs to the arm group (links, fingers, base). */
  readonly isArm: Uint8Array;
  /** Contact_Name of a non-arm geom, `undefined` for arm geoms. */
  readonly contactName: readonly (string | undefined)[];
}

function contactNameOf(geomName: string): string | undefined {
  if (geomName === SCENE_NAMES.floorGeom) return 'floor';
  const shape = BODY_SHAPES.find((s) => s.geomName === geomName);
  if (shape === undefined || shape.group === 'arm') return undefined;
  if (shape.group === 'drawer') return geomName === SCENE_NAMES.handleGeom ? 'handle' : 'drawer';
  return shape.group; // 'cabinet' or 'vase'
}

export function buildGeomTable(mujoco: MuJoCoModule, model: MjModel): GeomTable {
  const isArm = new Uint8Array(model.ngeom);
  const contactName: (string | undefined)[] = [];
  const geomType = mujoco.mjtObj.mjOBJ_GEOM;
  if (geomType === undefined) throw new Error('mjOBJ_GEOM is missing');
  for (let g = 0; g < model.ngeom; g += 1) {
    const name = mujoco.mj_id2name(model, geomType.value, g) ?? '';
    const shape = BODY_SHAPES.find((s) => s.geomName === name);
    isArm[g] = shape !== undefined && shape.group === 'arm' ? 1 : 0;
    contactName.push(isArm[g] === 1 ? undefined : contactNameOf(name));
  }
  return { isArm, contactName };
}

export interface ContactScan {
  readonly maxArmContactForceN: number;
  /** Sorted Contact_Names that an arm geom touched in this step. */
  readonly touched: readonly string[];
  /** Two different arm geoms are in contact (declared excluded pairs never produce a contact). */
  readonly selfCollision: boolean;
}

export const EMPTY_SCAN: ContactScan = { maxArmContactForceN: 0, touched: [], selfCollision: false };

/**
 * Scans the contacts of the current step. `data.contact` is a new owning copy on every access and
 * every `get` is a copy too, so both are released here. Only called when `data.ncon > 0`.
 */
export function scanContacts(mujoco: MuJoCoModule, model: MjModel, data: MjData, table: GeomTable, scope: Scope): ContactScan {
  const vec = scope.add(data.contact);
  const count = vec.size();
  if (count === 0) return EMPTY_SCAN;
  const force: DoubleBuffer = scope.add(mujoco.DoubleBuffer.FromArray([0, 0, 0, 0, 0, 0]));
  let maxForce = 0;
  let selfCollision = false;
  const touched = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const contact = vec.get(i);
    if (contact === undefined) continue;
    let g1: number;
    let g2: number;
    try {
      g1 = contact.geom1;
      g2 = contact.geom2;
    } finally {
      contact.delete();
    }
    const arm1 = table.isArm[g1] === 1;
    const arm2 = table.isArm[g2] === 1;
    if (!arm1 && !arm2) continue;
    if (arm1 && arm2) selfCollision = true;
    else {
      const other = table.contactName[arm1 ? g2 : g1];
      if (other !== undefined) touched.add(other);
    }
    mujoco.mj_contactForce(model, data, i, force);
    const normal = force.GetView()[0] as number; // fresh view, read at once
    if (normal > maxForce) maxForce = normal;
  }
  return { maxArmContactForceN: maxForce, touched: [...touched].sort(), selfCollision };
}

/** Limits of the arm hinges, read from the compiled model. */
export interface JointLimits {
  readonly qposIndex: readonly number[];
  readonly lower: readonly number[];
  readonly upper: readonly number[];
  readonly toleranceRad: number;
}

export function buildJointLimits(mujoco: MuJoCoModule, model: MjModel, jointNames: readonly string[], toleranceRad: number): JointLimits {
  const jointType = mujoco.mjtObj.mjOBJ_JOINT;
  if (jointType === undefined) throw new Error('mjOBJ_JOINT is missing');
  const range = readArray(model, 'jnt_range', 2 * model.njnt);
  const qposAdr = readArray(model, 'jnt_qposadr', model.njnt);
  const qposIndex: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];
  for (const name of jointNames) {
    const id = mujoco.mj_name2id(model, jointType.value, name);
    if (id < 0) throw new Error(`joint "${name}" is not in the model`);
    qposIndex.push(qposAdr[id] as number);
    lower.push(range[2 * id] as number);
    upper.push(range[2 * id + 1] as number);
  }
  return { qposIndex, lower, upper, toleranceRad };
}

/** True when an arm hinge is outside its model range by more than the declared tolerance. */
export function jointLimitExceeded(limits: JointLimits, qpos: Float64Array): boolean {
  for (let k = 0; k < limits.qposIndex.length; k += 1) {
    const q = qpos[limits.qposIndex[k] as number] as number;
    if (q < (limits.lower[k] as number) - limits.toleranceRad || q > (limits.upper[k] as number) + limits.toleranceRad) return true;
  }
  return false;
}
