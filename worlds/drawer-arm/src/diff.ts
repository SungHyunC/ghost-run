/**
 * Pure, complete diff of two states. Exact bit semantics: Object.is per number (so -0 differs from 0).
 * The result is empty if and only if the two states are equal in every field (Requirement 3.8, 3.9).
 */
import type { Change } from '@ghost-run/core';
import { STATIC_LAYOUT, qposAt } from './layout.js';
import type { GhostHandState } from './types.js';

type Plain = Record<string, unknown>;

/** Recursive equality with Object.is for numbers; typed arrays must have the same type, length, and bits. */
export function bitEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const aView = ArrayBuffer.isView(a);
    const bView = ArrayBuffer.isView(b);
    if (aView || bView) {
      if (!aView || !bView || a.constructor !== b.constructor) return false;
      const x = a as unknown as ArrayLike<number>;
      const y = b as unknown as ArrayLike<number>;
      if (x.length !== y.length) return false;
      for (let i = 0; i < x.length; i += 1) if (!Object.is(x[i], y[i])) return false;
      return true;
    }
    const aArr = Array.isArray(a);
    if (aArr !== Array.isArray(b)) return false;
    if (aArr) {
      const x = a as unknown[];
      const y = b as unknown[];
      if (x.length !== y.length) return false;
      for (let i = 0; i < x.length; i += 1) if (!bitEqual(x[i], y[i])) return false;
      return true;
    }
    const x = a as Plain;
    const y = b as Plain;
    const kx = Object.keys(x);
    const ky = Object.keys(y);
    if (kx.length !== ky.length) return false;
    for (const k of kx) {
      if (!Object.prototype.hasOwnProperty.call(y, k)) return false;
      if (!bitEqual(x[k], y[k])) return false;
    }
    return true;
  }
  return Object.is(a, b);
}

const KNOWN_FIELDS = ['schema', 'variant', 'steps', 'integration', 'poses', 'controller', 'prng', 'delayBuffer', 'delayHead', 'monitors'];

function compareChanges(a: Change, b: Change): number {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  const fa = typeof a['field'] === 'string' ? a['field'] : '';
  const fb = typeof b['field'] === 'string' ? b['field'] : '';
  if (fa === fb) return 0;
  return fa < fb ? -1 : 1;
}

function vase(state: GhostHandState): [number | undefined, number | undefined, number | undefined] {
  const o = STATIC_LAYOUT.vaseQposOffset;
  return [qposAt(state, o), qposAt(state, o + 1), qposAt(state, o + 2)];
}

/** Changes between two states, sorted by kind and then by field. */
export function diffStates(before: GhostHandState, after: GhostHandState): Change[] {
  const out: Change[] = [];

  const d0 = qposAt(before, STATIC_LAYOUT.drawerQposIndex);
  const d1 = qposAt(after, STATIC_LAYOUT.drawerQposIndex);
  if (!Object.is(d0, d1)) {
    out.push({ kind: 'drawer-displacement', before: d0 ?? null, after: d1 ?? null, delta: d0 !== undefined && d1 !== undefined ? d1 - d0 : null });
  }

  const v0 = vase(before);
  const v1 = vase(after);
  if (v0.some((c, i) => !Object.is(c, v1[i]))) {
    const complete = [...v0, ...v1].every((c) => c !== undefined);
    let distanceM: number | null = null;
    if (complete) {
      const dx = (v1[0] as number) - (v0[0] as number);
      const dy = (v1[1] as number) - (v0[1] as number);
      const dz = (v1[2] as number) - (v0[2] as number);
      distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    out.push({ kind: 'vase-displacement', before: complete ? [...v0] : null, after: complete ? [...v1] : null, distanceM });
  }

  const joints: number[] = [];
  STATIC_LAYOUT.armQposIndex.forEach((q, k) => {
    if (!Object.is(qposAt(before, q), qposAt(after, q))) joints.push(k);
  });
  if (joints.length > 0) out.push({ kind: 'arm-pose', joints });

  const a = before as unknown as Plain;
  const b = after as unknown as Plain;
  const fields = new Set<string>([...KNOWN_FIELDS, ...Object.keys(a), ...Object.keys(b)]);
  for (const field of fields) {
    if (!bitEqual(a[field], b[field])) out.push({ kind: 'state-field', field });
  }

  return out.sort(compareChanges);
}
