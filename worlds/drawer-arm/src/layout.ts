/**
 * Static layout of the integration state vector (mjSTATE_INTEGRATION) of the scene.
 * Diff, scene, and fingerprint are pure functions without an engine, so they read the offsets here.
 * `createGhostHandWorld` compares this table with the layout that the engine computed from the compiled
 * model and throws when they differ, so a change of the scene cannot silently desynchronize them.
 */
import type { StateLayout } from './engine/engine.js';
import type { GhostHandState } from './types.js';

export interface StaticLayout {
  readonly total: number;
  readonly time: number;
  readonly qpos: { readonly offset: number; readonly length: number };
  readonly qvel: { readonly offset: number; readonly length: number };
  readonly ctrl: { readonly offset: number; readonly length: number };
  readonly drawerQposIndex: number;
  readonly vaseQposOffset: number;
  readonly armQposIndex: readonly number[];
  readonly bodyNames: readonly string[];
}

export const STATIC_LAYOUT: StaticLayout = {
  total: 120,
  time: 0,
  qpos: { offset: 1, length: 14 },
  qvel: { offset: 15, length: 13 },
  ctrl: { offset: 41, length: 6 },
  drawerQposIndex: 6,
  vaseQposOffset: 7,
  armQposIndex: [0, 1, 2, 3],
  bodyNames: ['world', 'arm_base', 'arm_link1', 'arm_link2', 'arm_link3', 'finger_left', 'finger_right', 'cabinet', 'drawer', 'vase'],
};

/** Null when the engine layout equals the static table, otherwise a description of the first difference. */
export function layoutMismatch(engine: StateLayout): string | null {
  const s = STATIC_LAYOUT;
  const checks: readonly (readonly [string, unknown, unknown])[] = [
    ['total', s.total, engine.total],
    ['time', s.time, engine.time],
    ['qpos', JSON.stringify(s.qpos), JSON.stringify(engine.qpos)],
    ['qvel', JSON.stringify(s.qvel), JSON.stringify(engine.qvel)],
    ['ctrl', JSON.stringify(s.ctrl), JSON.stringify(engine.ctrl)],
    ['drawerQposIndex', s.drawerQposIndex, engine.drawerQposIndex],
    ['vaseQposOffset', s.vaseQposOffset, engine.vaseQposOffset],
    ['armQposIndex', JSON.stringify(s.armQposIndex), JSON.stringify(engine.armQposIndex)],
    ['bodyNames', JSON.stringify(s.bodyNames), JSON.stringify(engine.bodyNames)],
  ];
  for (const [name, a, b] of checks) if (a !== b) return `state layout differs from the engine layout at ${name}`;
  return null;
}

/** The value of qpos[index] in a state, or undefined when the state is too short. */
export function qposAt(state: GhostHandState, index: number): number | undefined {
  const at = STATIC_LAYOUT.qpos.offset + index;
  if (!(state.integration instanceof Float64Array) || at >= state.integration.length) return undefined;
  return state.integration[at];
}
