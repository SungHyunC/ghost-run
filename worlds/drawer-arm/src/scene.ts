/** Pure scene of a state: JSON values only, finite numbers, -0 written as 0, no typed array. */
import type { Scene, SceneValue } from '@ghost-run/core';
import { STATIC_LAYOUT } from './layout.js';
import { POSE_STRIDE } from './engine/engine.js';
import type { GhostHandState } from './types.js';

export function finite(n: number): number {
  return Number.isFinite(n) ? (n === 0 ? 0 : n) : 0;
}

function at(a: ArrayLike<number> | undefined, i: number): number {
  const v = a?.[i];
  return typeof v === 'number' ? finite(v) : 0;
}

export function renderScene(state: GhostHandState): Scene {
  const q = STATIC_LAYOUT.qpos.offset;
  const integ = state.integration;
  const bodies: SceneValue[] = STATIC_LAYOUT.bodyNames.map((name, b) => {
    const o = POSE_STRIDE * b;
    return {
      name,
      pos: [at(state.poses, o), at(state.poses, o + 1), at(state.poses, o + 2)],
      quat: [at(state.poses, o + 3), at(state.poses, o + 4), at(state.poses, o + 5), at(state.poses, o + 6)],
    };
  });
  const m = state.monitors;
  return {
    timeS: at(integ, STATIC_LAYOUT.time),
    steps: finite(state.steps),
    drawerM: at(integ, q + STATIC_LAYOUT.drawerQposIndex),
    vase: [0, 1, 2].map((k) => at(integ, q + STATIC_LAYOUT.vaseQposOffset + k)),
    joints: STATIC_LAYOUT.armQposIndex.map((k) => at(integ, q + k)),
    bodies,
    holding: state.controller.holding,
    monitors: {
      maxContactForceN: finite(m.maxContactForceN),
      touched: [...m.touched],
      jointLimitExceeded: m.jointLimitExceeded,
      jointLimitSteps: finite(m.jointLimitSteps),
      selfCollisionOccurred: m.selfCollisionOccurred,
      selfCollisionSteps: finite(m.selfCollisionSteps),
    },
  };
}
