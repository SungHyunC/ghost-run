import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORLD_CONFIG } from '@ghost-run/drawer-arm';
import { buildHandPlan } from '../../src/live/hand-plan';

const ROOT = resolve(__dirname, '../../..');
const planActions = (name: string): unknown[] =>
  (JSON.parse(readFileSync(resolve(ROOT, 'apps/ghost-hand/plans', name), 'utf8')) as { actions: unknown[] }).actions;

function build(speed: number, force: number, distance: number) {
  const r = buildHandPlan({ speed, force, distance });
  if (!r.ok) throw new Error(r.error);
  return r.actions;
}

describe('buildHandPlan', () => {
  it('gives the actions of first.plan.json for (0.6, 20, 0.2)', () => {
    expect(build(0.6, 20, 0.2)).toEqual(planActions('first.plan.json'));
  });

  it('gives the actions of revised.plan.json for (0.15, 15, 0.15)', () => {
    expect(build(0.15, 15, 0.15)).toEqual(planActions('revised.plan.json'));
  });

  it('clamps a value just below and above each range', () => {
    const r = WORLD_CONFIG.actionRanges;
    const eps = 1e-6;
    const low = build(r.speed[0] - eps, r.force[0] - 1, r.distance[0] - eps);
    expect(low[2]).toEqual({ type: 'grasp', force: r.force[0] });
    expect(low[3]).toEqual({ type: 'pull', distance: r.distance[0], speed: r.speed[0] });
    const high = build(r.speed[1] + eps, r.force[1] + 1, r.distance[1] + eps);
    expect(high[2]).toEqual({ type: 'grasp', force: r.force[1] });
    expect(high[3]).toEqual({ type: 'pull', distance: r.distance[1], speed: r.speed[1] });
  });

  it('rounds 0.15000000000000002 to 0.15', () => {
    const a = build(0.15000000000000002, 15, 0.15000000000000002);
    expect(a[3]).toEqual({ type: 'pull', distance: 0.15, speed: 0.15 });
  });

  it('returns an error for a non-finite value', () => {
    expect(buildHandPlan({ speed: Number.NaN, force: 20, distance: 0.2 }).ok).toBe(false);
  });
});
