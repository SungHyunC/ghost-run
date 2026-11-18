import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeAction, validateAction } from '../src/actions.js';
import { WORLD_CONFIG } from '../src/world-config.js';

const r = WORLD_CONFIG.actionRanges;
type Range = readonly [number, number];

const reach = (t: unknown, speed: unknown): unknown => ({ type: 'reach', target: t, speed });
const ok = (a: unknown): boolean => validateAction(a).ok;

function allRanges(): [string, Range][] {
  return [
    ['target.x', r.target.x],
    ['target.y', r.target.y],
    ['target.z', r.target.z],
    ['speed', r.speed],
    ['force', r.force],
    ['distance', r.distance],
  ];
}

describe('action ranges', () => {
  it.each(allRanges())('%s is a closed interval of finite numbers with min <= max', (_n, [lo, hi]) => {
    expect(Number.isFinite(lo)).toBe(true);
    expect(Number.isFinite(hi)).toBe(true);
    expect(lo).toBeLessThanOrEqual(hi);
  });
});

describe('validateAction', () => {
  const mid = (x: Range): number => (x[0] + x[1]) / 2;
  const nominalTarget = [mid(r.target.x), mid(r.target.y), mid(r.target.z)];

  it('accepts reach at each boundary of every field', () => {
    for (const x of r.target.x) for (const s of r.speed) {
      expect(ok(reach([x, nominalTarget[1], nominalTarget[2]], s))).toBe(true);
    }
    for (const y of r.target.y) expect(ok(reach([nominalTarget[0], y, nominalTarget[2]], r.speed[0]))).toBe(true);
    for (const z of r.target.z) expect(ok(reach([nominalTarget[0], nominalTarget[1], z], r.speed[1]))).toBe(true);
  });

  it('accepts grasp, pull, release at boundaries', () => {
    for (const f of r.force) expect(ok({ type: 'grasp', force: f })).toBe(true);
    for (const d of r.distance) for (const s of r.speed) {
      expect(ok({ type: 'pull', distance: d, speed: s })).toBe(true);
    }
    expect(ok({ type: 'release' })).toBe(true);
  });

  it('rejects one step outside each range without clamping', () => {
    const below = (x: number): number => x - 1e-9 - Math.abs(x) * 1e-12;
    const above = (x: number): number => x + 1e-9 + Math.abs(x) * 1e-12;
    const ax = nominalTarget;
    for (const f of [below, above]) {
      expect(ok(reach([f(f === below ? r.target.x[0] : r.target.x[1]), ax[1], ax[2]], 0.3))).toBe(false);
      expect(ok(reach([ax[0], f(f === below ? r.target.y[0] : r.target.y[1]), ax[2]], 0.3))).toBe(false);
      expect(ok(reach([ax[0], ax[1], f(f === below ? r.target.z[0] : r.target.z[1])], 0.3))).toBe(false);
      expect(ok(reach(ax, f(f === below ? r.speed[0] : r.speed[1])))).toBe(false);
      expect(ok({ type: 'grasp', force: f(f === below ? r.force[0] : r.force[1]) })).toBe(false);
      expect(ok({ type: 'pull', distance: f(f === below ? r.distance[0] : r.distance[1]), speed: 0.3 })).toBe(false);
      expect(ok({ type: 'pull', distance: 0.1, speed: f(f === below ? r.speed[0] : r.speed[1]) })).toBe(false);
    }
  });

  it('does not mutate or clamp the input', () => {
    const a = { type: 'grasp', force: r.force[1] + 5 };
    const copy = JSON.stringify(a);
    expect(validateAction(a).ok).toBe(false);
    expect(JSON.stringify(a)).toBe(copy);
  });

  it('rejects NaN, Infinity, strings, and missing fields', () => {
    for (const bad of [NaN, Infinity, -Infinity, '0.1', null, undefined]) {
      expect(ok({ type: 'grasp', force: bad })).toBe(false);
      expect(ok({ type: 'pull', distance: bad, speed: 0.3 })).toBe(false);
      expect(ok({ type: 'pull', distance: 0.1, speed: bad })).toBe(false);
      expect(ok(reach([bad, 0.1, 0.3], 0.3))).toBe(false);
      expect(ok(reach([0, bad, 0.3], 0.3))).toBe(false);
      expect(ok(reach([0, 0.1, bad], 0.3))).toBe(false);
      expect(ok(reach([0, 0.1, 0.3], bad))).toBe(false);
    }
    expect(ok({ type: 'grasp' })).toBe(false);
    expect(ok({ type: 'pull', distance: 0.1 })).toBe(false);
    expect(ok({ type: 'reach', speed: 0.3 })).toBe(false);
    expect(ok(reach([0, 0.1], 0.3))).toBe(false);
    expect(ok(reach([0, 0.1, 0.3, 0.4], 0.3))).toBe(false);
  });

  it('rejects unknown type and non-object input', () => {
    expect(ok({ type: 'push' })).toBe(false);
    expect(ok({})).toBe(false);
    expect(ok({ type: 5 })).toBe(false);
    for (const bad of [null, undefined, 3, 'reach', [], true]) expect(ok(bad)).toBe(false);
  });

  it('returns a non-empty error message when not ok', () => {
    const res = validateAction({ type: 'grasp', force: NaN });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.length).toBeGreaterThan(0);
  });
});

describe('describeAction', () => {
  it('prints each action type', () => {
    expect(describeAction({ type: 'reach', target: [0.1, 0.2, 0.3], speed: 0.4 })).toBe(
      'reach(x=0.1, y=0.2, z=0.3, speed=0.4)',
    );
    expect(describeAction({ type: 'grasp', force: 12 })).toBe('grasp(force=12)');
    expect(describeAction({ type: 'pull', distance: 0.1, speed: 0.25 })).toBe('pull(distance=0.1, speed=0.25)');
    expect(describeAction({ type: 'release' })).toBe('release()');
  });
});

describe('WORLD_CONFIG', () => {
  it('lists vase among the contact names', () => {
    expect(WORLD_CONFIG.contactNames).toContain('vase');
  });

  it('reads no clock or random source', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/world-config.ts', import.meta.url)), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Date|performance|Math\s*\.\s*random|crypto|setTimeout|setInterval|hrtime/);
  });
});
