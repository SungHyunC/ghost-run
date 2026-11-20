// Slider values to the five actions of a Ghost Hand plan.

import firstPlan from '../../../apps/ghost-hand/plans/first.plan.json?raw';
import { parsePlanFile } from '../../../apps/ghost-hand/src/plan/plan-file';
import { validateAction } from '@ghost-run/drawer-arm';
import type { GhostHandAction } from '@ghost-run/drawer-arm';
import { normalizeSliders } from './input';
import type { SliderValues } from './input';

export type HandPlanResult =
  | { ok: true; actions: GhostHandAction[] }
  | { ok: false; error: string };

/**
 * Keeps the reach, reach, and release actions of `first.plan.json` and builds the grasp and pull actions
 * from the sliders. The values are clamped and rounded first; every action passes `validateAction`.
 */
export function buildHandPlan(values: SliderValues): HandPlanResult {
  const parsed = parsePlanFile(firstPlan);
  if (!parsed.ok) return { ok: false, error: 'first.plan.json is not a valid plan file' };
  const base = parsed.plan.actions;
  const reach1 = base[0];
  const reach2 = base[1];
  const release = base[4];
  if (reach1 === undefined || reach2 === undefined || release === undefined) {
    return { ok: false, error: 'first.plan.json has fewer than five actions' };
  }
  const n = normalizeSliders(values);
  if (!n.ok) return { ok: false, error: 'slider values must be finite numbers' };
  const actions: GhostHandAction[] = [
    reach1,
    reach2,
    { type: 'grasp', force: n.values.force },
    { type: 'pull', distance: n.values.distance, speed: n.values.speed },
    release,
  ];
  for (const a of actions) {
    const check = validateAction(a);
    if (!check.ok) return { ok: false, error: check.error };
  }
  return { ok: true, actions };
}
