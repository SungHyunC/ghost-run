import { WORLD_CONFIG } from './world-config.js';
import type { GhostHandAction } from './types.js';

export type ActionCheck = { ok: true } | { ok: false; error: string };

type Range = readonly [number, number];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkNumber(name: string, v: unknown, range: Range): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return `${name} must be a finite number`;
  }
  if (v < range[0] || v > range[1]) {
    return `${name} is outside [${String(range[0])}, ${String(range[1])}]`;
  }
  return null;
}

/** Checks shape, finiteness, and the closed ranges. Never clamps and never throws. */
export function validateAction(a: unknown): ActionCheck {
  if (!isRecord(a)) return { ok: false, error: 'action must be an object' };
  const r = WORLD_CONFIG.actionRanges;
  let err: string | null = null;
  switch (a['type']) {
    case 'reach': {
      const t = a['target'];
      if (!Array.isArray(t) || t.length !== 3) {
        return { ok: false, error: 'target must be an array of 3 numbers' };
      }
      err =
        checkNumber('target.x', t[0], r.target.x) ??
        checkNumber('target.y', t[1], r.target.y) ??
        checkNumber('target.z', t[2], r.target.z) ??
        checkNumber('speed', a['speed'], r.speed);
      break;
    }
    case 'grasp':
      err = checkNumber('force', a['force'], r.force);
      break;
    case 'pull':
      err = checkNumber('distance', a['distance'], r.distance) ?? checkNumber('speed', a['speed'], r.speed);
      break;
    case 'release':
      break;
    default:
      return { ok: false, error: 'type must be one of reach, grasp, pull, release' };
  }
  return err === null ? { ok: true } : { ok: false, error: err };
}

/** Text form of an action; numbers are printed by String(number). */
export function describeAction(a: GhostHandAction): string {
  switch (a.type) {
    case 'reach':
      return `reach(x=${String(a.target[0])}, y=${String(a.target[1])}, z=${String(a.target[2])}, speed=${String(a.speed)})`;
    case 'grasp':
      return `grasp(force=${String(a.force)})`;
    case 'pull':
      return `pull(distance=${String(a.distance)}, speed=${String(a.speed)})`;
    case 'release':
      return 'release()';
  }
}
