// Feature: ghost-hand, Property 11: A reused snapshot reproduces a run bit for bit (contract P3)
// **Validates: Requirements 3.4, 6.6, 17.5**
// Claim scope (P3): the world, all worlds' definition; the evidence here is for the Tested_Environments.
import { ghostRun } from '@ghost-run/core';
import type { Snapshot } from '@ghost-run/core';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import variantConfigJson from '../variant-config.json' with { type: 'json' };
import { loadMujoco } from '../src/engine/index.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { applyVariant, sampleVariant } from '../src/variant.js';
import { parseVariantConfig } from '../src/variant-config.js';
import type { VariantConfig } from '../src/variant-config.js';
import { createGhostHandWorld } from '../src/world.js';
import type { GhostHandWorld } from '../src/world.js';
import { ENGINE_RUNS } from './pbt-config.js';

const parsed = parseVariantConfig(JSON.stringify(variantConfigJson));
if (!parsed.ok) throw new Error('variant-config.json does not parse');
const CONFIG: VariantConfig = parsed.config;

const PROPERTY_TIMEOUT = 600_000;

// ---- bit-exact comparison -------------------------------------------------------------------------------

/** First path where the two values differ bit for bit (-0 and 0 differ), or null. Typed arrays element by element. */
function firstDifference(a: unknown, b: unknown, path = 'state'): string | null {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) ? null : `${path}: ${String(a)} vs ${String(b)}`;
  if (a instanceof Float64Array && b instanceof Float64Array) {
    if (a.length !== b.length) return `${path}.length: ${String(a.length)} vs ${String(b.length)}`;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return `${path}[${String(i)}]: ${String(a[i])} vs ${String(b[i])}`;
    }
    return null;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length: ${String(a.length)} vs ${String(b.length)}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${String(i)}]`);
      if (d !== null) return d;
    }
    return null;
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    if (Array.isArray(a) !== Array.isArray(b) || a.constructor !== b.constructor) return `${path}: different kinds`;
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join(',') !== kb.join(',')) return `${path}: keys ${ka.join(',')} vs ${kb.join(',')}`;
    for (const k of ka) {
      const d = firstDifference((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      if (d !== null) return d;
    }
    return null;
  }
  return Object.is(a, b) ? null : `${path}: ${String(a)} vs ${String(b)}`;
}

function sameState(a: GhostHandState, b: GhostHandState): string | null {
  return firstDifference(a, b);
}

// ---- generators -----------------------------------------------------------------------------------------

const finiteIn = (min: number, max: number): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((v) => v + 0);

const reachArb: fc.Arbitrary<GhostHandAction> = fc.record({
  type: fc.constant('reach' as const),
  target: fc.tuple(finiteIn(-0.3, 0.3), finiteIn(-0.3, 0.7), finiteIn(0.05, 0.7)),
  speed: finiteIn(0.05, 0.6),
});
const graspArb: fc.Arbitrary<GhostHandAction> = fc.record({ type: fc.constant('grasp' as const), force: finiteIn(2, 40) });
const pullArb: fc.Arbitrary<GhostHandAction> = fc.record({
  type: fc.constant('pull' as const),
  distance: finiteIn(0.02, 0.25),
  speed: finiteIn(0.05, 0.6),
});
const releaseArb: fc.Arbitrary<GhostHandAction> = fc.constant({ type: 'release' as const });

const actionArb = fc.oneof(reachArb, graspArb, pullArb, releaseArb);
const planArb = fc.array(actionArb, { minLength: 1, maxLength: 50 });
const prefixArb = fc.array(actionArb, { minLength: 0, maxLength: 4 });

const seedArb = fc.integer({ min: 0, max: 4294967295 });
const indexArb = fc.integer({ min: 0, max: 19 });

// ---- fixture --------------------------------------------------------------------------------------------

let world: GhostHandWorld;

beforeAll(async () => {
  world = await createGhostHandWorld({ mujoco: await loadMujoco(), recordTrajectory: false });
}, 60_000);

afterAll(() => {
  world.dispose();
});

/** A deep copy of the state that keeps every Float64Array element (structuredClone keeps -0). */
const copyOf = (s: GhostHandState): GhostHandState => structuredClone(s);

/** The same world, with `step` checking that the input snapshot is unchanged after each call. */
function checkedWorld(violations: string[]): GhostHandWorld {
  return new Proxy(world, {
    get(target, prop) {
      if (prop !== 'step') {
        const v = Reflect.get(target, prop) as unknown;
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      }
      return async (s: Snapshot<GhostHandState>, a: GhostHandAction): Promise<Snapshot<GhostHandState>> => {
        const before = copyOf(s.state);
        const out = await target.step(s, a);
        const d = firstDifference(before, s.state, 'input');
        if (d !== null) violations.push(d);
        return out;
      };
    },
  });
}

/** The state reached by `prefix` from the variant's initial state, as a snapshot. */
async function startFor(seed: number, index: number, prefix: readonly GhostHandAction[]): Promise<Snapshot<GhostHandState>> {
  const base = (await world.snapshot()).state;
  const params = sampleVariant(seed, index, CONFIG);
  const first = world.adopt(applyVariant(base, params));
  const report = await ghostRun(world, first, prefix);
  const last = report.snapshots[report.snapshots.length - 1] as Snapshot<GhostHandState>;
  return world.adopt(last.state);
}

async function checkReuse(
  seed: number,
  index: number,
  prefix: readonly GhostHandAction[],
  plan: readonly GhostHandAction[],
): Promise<void> {
  const start = await startFor(seed, index, prefix);
  const pristine = copyOf(start.state);
  const violations: string[] = [];
  const guarded = checkedWorld(violations);

  const one = await ghostRun(guarded, start, plan);
  expect(violations, 'step changed its input snapshot').toEqual([]);
  expect(firstDifference(pristine, start.state, 'start'), 'start unchanged after run 1').toBeNull();

  const two = await ghostRun(guarded, start, plan);
  expect(violations, 'step changed its input snapshot').toEqual([]);
  expect(firstDifference(pristine, start.state, 'start'), 'start unchanged after run 2').toBeNull();

  expect(two.snapshots.length).toBe(one.snapshots.length);
  const a = one.snapshots[one.snapshots.length - 1] as Snapshot<GhostHandState>;
  const b = two.snapshots[two.snapshots.length - 1] as Snapshot<GhostHandState>;
  // Final states: integration vector (warm-start values), PRNG state, delay buffer, and everything else.
  expect(sameState(a.state, b.state), 'final states element-equal').toBeNull();
  expect(a.state.integration.length).toBe(b.state.integration.length);
  expect(Object.is(a.state.prng, b.state.prng)).toBe(true);
  expect(firstDifference(a.state.delayBuffer, b.state.delayBuffer, 'delayBuffer')).toBeNull();
  // Every intermediate state too.
  for (let i = 0; i < one.snapshots.length; i++) {
    const s1 = one.snapshots[i] as Snapshot<GhostHandState>;
    const s2 = two.snapshots[i] as Snapshot<GhostHandState>;
    expect(sameState(s1.state, s2.state), `snapshot ${String(i)} element-equal`).toBeNull();
    expect(s1.result).toEqual(s2.result);
  }
}

describe('Property 11: a reused snapshot reproduces a run bit for bit (contract P3)', () => {
  it(
    'step leaves its input unchanged and two ghost runs from one snapshot end in element-equal states',
    async () => {
      await fc.assert(
        fc.asyncProperty(seedArb, indexArb, prefixArb, planArb, async (seed, index, prefix, plan) => {
          await checkReuse(seed, index, prefix, plan);
        }),
        { numRuns: ENGINE_RUNS },
      );
    },
    PROPERTY_TIMEOUT,
  );

  it('fixed example: a delayed, noisy variant with a short pull plan reproduces bit for bit', async () => {
    const plan: GhostHandAction[] = [
      { type: 'reach', target: [0, 0.2, 0.18], speed: 0.4 },
      { type: 'grasp', force: 20 },
      { type: 'pull', distance: 0.05, speed: 0.2 },
      { type: 'release' },
    ];
    const start = await startFor(42, 3, []);
    const run = await ghostRun(world, start, plan);
    const last = run.snapshots[run.snapshots.length - 1] as Snapshot<GhostHandState>;
    expect(last.state.steps, 'the example really simulates').toBeGreaterThan(0);
    await checkReuse(42, 3, [], plan);
    await checkReuse(7, 19, [{ type: 'release' }], plan);
  }, PROPERTY_TIMEOUT);

  it('the comparison tells -0 from 0 and sees one changed typed-array element', () => {
    expect(firstDifference(new Float64Array([0]), new Float64Array([-0]))).not.toBeNull();
    expect(firstDifference(new Float64Array([1, 2, 3]), new Float64Array([1, 2, 3]))).toBeNull();
    expect(firstDifference(new Float64Array([1, 2, 3]), new Float64Array([1, 2, 4]))).not.toBeNull();
  });
});
