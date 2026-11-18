import type { GhostHandAction } from './types.js';

/** Identifier stored beside the Golden_Hash; change it whenever REFERENCE_PLAN changes. */
export const REFERENCE_PLAN_ID = 'reference-plan-v1';

/**
 * Fixed valid plan of the four action types for the Determinism_Self_Check and the Golden_Hash.
 * A front-approach waypoint (the first reach) comes before the reach to the handle, because a joint-space
 * straight line from the home pose would sweep the hand through the cabinet. On the Base_World the plan
 * runs about 4.1 simulated seconds (at most 5) and opens the drawer by about 0.127 m (the target is 0.12 m).
 */
export const REFERENCE_PLAN: readonly GhostHandAction[] = Object.freeze([
  Object.freeze({ type: 'reach', target: Object.freeze([0, 0.2, 0.18] as const), speed: 0.4 }),
  Object.freeze({ type: 'reach', target: Object.freeze([0, 0.02, 0.18] as const), speed: 0.2 }),
  Object.freeze({ type: 'grasp', force: 20 }),
  Object.freeze({ type: 'pull', distance: 0.15, speed: 0.15 }),
  Object.freeze({ type: 'release' }),
] as const);
