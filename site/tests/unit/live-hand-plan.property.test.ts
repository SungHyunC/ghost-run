// Feature: site-live, Property L12: Slider plans are valid and equal the plan files
// **Validates: Requirements 5.4, 3.2, 9.2**
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WORLD_CONFIG, validateAction } from '@ghost-run/drawer-arm';
import { buildHandPlan } from '../../src/live/hand-plan';
import { normalizeSliders } from '../../src/live/input';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const ROOT = resolve(__dirname, '../../..');
const firstActions = (
  JSON.parse(readFileSync(resolve(ROOT, 'apps/ghost-hand/plans/first.plan.json'), 'utf8')) as { actions: unknown[] }
).actions;

const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 });
const sliders = fc.record({ speed: finite, force: finite, distance: finite });

const decimals = (v: number, digits: number): boolean => Math.abs(v * 10 ** digits - Math.round(v * 10 ** digits)) < 1e-9;

describe('Property L12: slider plans', () => {
  it(
    'normalizeSliders returns values inside the ranges rounded to the step',
    () => {
      const r = WORLD_CONFIG.actionRanges;
      fc.assert(
        fc.property(sliders, (v) => {
          const n = normalizeSliders(v);
          expect(n.ok).toBe(true);
          if (!n.ok) return;
          const { speed, force, distance } = n.values;
          expect(speed).toBeGreaterThanOrEqual(r.speed[0]);
          expect(speed).toBeLessThanOrEqual(r.speed[1]);
          expect(force).toBeGreaterThanOrEqual(r.force[0]);
          expect(force).toBeLessThanOrEqual(r.force[1]);
          expect(distance).toBeGreaterThanOrEqual(r.distance[0]);
          expect(distance).toBeLessThanOrEqual(r.distance[1]);
          expect(Number.isInteger(force)).toBe(true);
          expect(decimals(speed, 2)).toBe(true);
          expect(decimals(distance, 2)).toBe(true);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'buildHandPlan gives five valid actions that keep the file actions and carry the rounded values',
    () => {
      fc.assert(
        fc.property(sliders, (v) => {
          const n = normalizeSliders(v);
          const plan = buildHandPlan(v);
          expect(n.ok && plan.ok).toBe(true);
          if (!n.ok || !plan.ok) return;
          expect(plan.actions).toHaveLength(5);
          for (const a of plan.actions) expect(validateAction(a).ok).toBe(true);
          expect(plan.actions[0]).toEqual(firstActions[0]);
          expect(plan.actions[1]).toEqual(firstActions[1]);
          expect(plan.actions[4]).toEqual(firstActions[4]);
          expect(plan.actions[2]).toEqual({ type: 'grasp', force: n.values.force });
          expect(plan.actions[3]).toEqual({ type: 'pull', distance: n.values.distance, speed: n.values.speed });
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );
});
