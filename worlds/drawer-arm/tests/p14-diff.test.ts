// Feature: ghost-hand, Property 14: Diff is complete, pure, and ordered
// **Validates: Requirements 3.8, 3.9**
import { ghostRun } from '@ghost-run/core';
import type { Change, Snapshot } from '@ghost-run/core';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMujoco } from '../src/engine/index.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { createGhostHandWorld } from '../src/world.js';
import type { GhostHandWorld } from '../src/world.js';
import { ENGINE_RUNS } from './pbt-config.js';

const PROPERTY_TIMEOUT = 600_000;

// ---- independent oracle: Object.is per element, in every field ------------------------------------------

function sameBits(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b);
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor) return false;
    const x = a as unknown as ArrayLike<number>;
    const y = b as unknown as ArrayLike<number>;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) return false;
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameBits(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join(',') !== kb.join(',')) return false;
    return ka.every((k) => sameBits((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return Object.is(a, b);
}

// ---- generators (valid actions from WORLD_CONFIG.actionRanges) ------------------------------------------

const num = (min: number, max: number): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((v) => v + 0);

const actionArb: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc.record({
    type: fc.constant('reach' as const),
    target: fc.tuple(num(-0.3, 0.3), num(-0.3, 0.7), num(0.05, 0.7)),
    speed: num(0.05, 0.6),
  }),
  fc.record({ type: fc.constant('grasp' as const), force: num(2, 40) }),
  fc.record({ type: fc.constant('pull' as const), distance: num(0.02, 0.25), speed: num(0.05, 0.6) }),
  fc.constant({ type: 'release' as const }),
) as fc.Arbitrary<GhostHandAction>;

const planArb = fc.array(actionArb, { minLength: 0, maxLength: 8 });

// ---- fixture --------------------------------------------------------------------------------------------

let world: GhostHandWorld;

beforeAll(async () => {
  world = await createGhostHandWorld({ mujoco: await loadMujoco(), recordTrajectory: false });
}, 60_000);

afterAll(() => {
  world.dispose();
});

/** The state reached by `plan` from the initial state, as a snapshot. */
async function reach(plan: readonly GhostHandAction[]): Promise<Snapshot<GhostHandState>> {
  const report = await ghostRun(world, await world.snapshot(), plan);
  const last = report.snapshots[report.snapshots.length - 1] as Snapshot<GhostHandState>;
  const out = world.adopt(last.state);
  world.releaseTraces(report.snapshots.map((s) => s.id));
  return out;
}

/** A copy with exactly one element changed under Object.is (steps + 1 always differs). */
function perturbed(s: GhostHandState): GhostHandState {
  const c = structuredClone(s);
  if (c.integration.length > 0) {
    c.integration[0] = Object.is(c.integration[0], 0) ? -0 : 0;
    if (Object.is(c.integration[0], s.integration[0])) c.integration[0] = 1;
    return c;
  }
  return { ...c, steps: s.steps + 1 };
}

function checkOrdered(changes: readonly Change[]): void {
  const key = (c: Change): [string, string] => [c.kind, typeof c['field'] === 'string' ? c['field'] : ''];
  for (let i = 1; i < changes.length; i++) {
    const [k0, f0] = key(changes[i - 1] as Change);
    const [k1, f1] = key(changes[i] as Change);
    const ok = k0 < k1 || (k0 === k1 && f0 <= f1);
    expect(ok, `change ${String(i)} is out of order`).toBe(true);
  }
}

function checkPair(a: Snapshot<GhostHandState>, b: Snapshot<GhostHandState>): void {
  const beforeA = structuredClone(a.state);
  const beforeB = structuredClone(b.state);
  const first = world.diff(a, b);
  const second = world.diff(a, b);

  expect(first.length === 0, 'empty iff equal under Object.is per element').toBe(sameBits(a.state, b.state));
  checkOrdered(first);
  expect(second).toEqual(first);
  expect(sameBits(a.state, beforeA), 'diff changed its first input').toBe(true);
  expect(sameBits(b.state, beforeB), 'diff changed its second input').toBe(true);
}

describe('Property 14: diff is complete, pure, and ordered', () => {
  it(
    'holds for states reached by generated plans, a state against itself, a copy, and a one-element change',
    async () => {
      await fc.assert(
        fc.asyncProperty(planArb, planArb, async (planA, planB) => {
          const a = await reach(planA);
          const b = await reach(planB);
          checkPair(a, b);
          checkPair(b, a);
          checkPair(a, a);
          checkPair(a, world.adopt(structuredClone(a.state)));
          const p = world.adopt(perturbed(a.state));
          checkPair(a, p);
          expect(world.diff(a, p).length, 'a one-element change is reported').toBeGreaterThan(0);
        }),
        { numRuns: ENGINE_RUNS },
      );
    },
    PROPERTY_TIMEOUT,
  );

  it('fixed example: identical states give an empty diff, -0 against 0 does not', async () => {
    const plan: GhostHandAction[] = [
      { type: 'reach', target: [0, 0.2, 0.18], speed: 0.4 },
      { type: 'grasp', force: 20 },
      { type: 'pull', distance: 0.05, speed: 0.2 },
    ];
    const a = await reach(plan);
    expect(world.diff(a, a)).toEqual([]);
    expect(world.diff(a, world.adopt(structuredClone(a.state)))).toEqual([]);
    const fresh = await world.snapshot();
    expect(world.diff(fresh, a).length, 'the plan changes something').toBeGreaterThan(0);

    const zero = structuredClone(a.state);
    zero.integration[0] = 0;
    const negZero = structuredClone(a.state);
    negZero.integration[0] = -0;
    const d = world.diff(world.adopt(zero), world.adopt(negZero));
    expect(d).toEqual([{ kind: 'state-field', field: 'integration' }]);
  });
});
