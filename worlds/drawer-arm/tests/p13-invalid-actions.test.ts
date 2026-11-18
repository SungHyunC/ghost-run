// Feature: ghost-hand, Property 13: Invalid actions fail without clamping or throwing (GH-P13)
// **Validates: Requirements 3.6, 5.2**
// Invalid actions are never passed to effectsOutside or ghostRun (they throw there by contract).
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateAction } from '../src/actions.js';
import { loadMujoco } from '../src/engine/index.js';
import type { MuJoCoModule } from '../src/engine/index.js';
import type { GhostHandAction } from '../src/types.js';
import { WORLD_CONFIG } from '../src/world-config.js';
import { createGhostHandWorld } from '../src/world.js';
import { ENGINE_RUNS, NUM_RUNS } from './pbt-config.js';

const RUN_TIMEOUT_MS = 300_000;
const R = WORLD_CONFIG.actionRanges;
type Range = readonly [number, number];

const inRange = ([min, max]: Range): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((v) => v + 0);

/** A number outside the closed range, a non-finite number, or a non-number. */
const badValue = ([min, max]: Range): fc.Arbitrary<unknown> =>
  fc.oneof(
    fc.double({ min: 1e-9, max: 1e6, noNaN: true, noDefaultInfinity: true }).map((d) => max + d),
    fc.double({ min: 1e-9, max: 1e6, noNaN: true, noDefaultInfinity: true }).map((d) => min - d),
    fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
    fc.constantFrom('0.1', 'abc', '', null, undefined, true, false, {}, [], [0.1]),
  );

// Valid actions (all values inside the ranges).
const validAction: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc.record({
    type: fc.constant('reach' as const),
    target: fc.tuple(inRange(R.target.x), inRange(R.target.y), inRange(R.target.z)),
    speed: inRange(R.speed),
  }),
  fc.record({ type: fc.constant('grasp' as const), force: inRange(R.force) }),
  fc.record({ type: fc.constant('pull' as const), distance: inRange(R.distance), speed: inRange(R.speed) }),
  fc.constant({ type: 'release' as const }),
) as fc.Arbitrary<GhostHandAction>;

// Valid type with at least one bad value. Release has no values, so it cannot be invalid this way.
const invalidAction: fc.Arbitrary<unknown> = fc.oneof(
  fc
    .record({
      axis: fc.constantFrom(0, 1, 2),
      bad: fc.constantFrom(0, 1, 2).chain((i) => badValue([R.target.x, R.target.y, R.target.z][i] as Range)),
      base: validAction.filter((a) => a.type === 'reach'),
    })
    .map(({ axis, base, bad }) => {
      const target: unknown[] = [...(base as Extract<GhostHandAction, { type: 'reach' }>).target];
      // Corrupt the chosen axis with a value bad for THAT axis range.
      target[axis] = bad;
      return { ...base, target };
    })
    .filter((a) => !validateAction(a).ok),
  fc
    .tuple(validAction.filter((a) => a.type === 'reach'), badValue(R.speed))
    .map(([base, bad]) => ({ ...base, speed: bad })),
  fc.tuple(validAction.filter((a) => a.type === 'grasp'), badValue(R.force)).map(([base, bad]) => ({ ...base, force: bad })),
  fc
    .tuple(validAction.filter((a) => a.type === 'pull'), badValue(R.distance))
    .map(([base, bad]) => ({ ...base, distance: bad })),
  fc.tuple(validAction.filter((a) => a.type === 'pull'), badValue(R.speed)).map(([base, bad]) => ({ ...base, speed: bad })),
).filter((a) => !validateAction(a).ok);

/** Structural form: typed arrays as bytes, numbers by Object.is (-0, NaN), so equality is exact. */
function normalize(v: unknown): unknown {
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : Number.isNaN(v) ? 'NaN' : v;
  if (v === undefined) return '__undefined__';
  if (ArrayBuffer.isView(v)) {
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return `${v.constructor.name}:${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'object' && v !== null) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalize(x)]));
  }
  return v;
}

describe('Property 13 (GH-P13): invalid actions fail without clamping or throwing', () => {
  it('validateAction rejects every invalid action and changes nothing', () => {
    fc.assert(
      fc.property(invalidAction, (a) => {
        const before = normalize(a);
        const check = validateAction(a);
        expect(check.ok).toBe(false);
        if (!check.ok) expect(check.error.length).toBeGreaterThan(0);
        expect(normalize(a)).toEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('validateAction accepts every valid action and keeps all values', () => {
    fc.assert(
      fc.property(validAction, (a) => {
        const before = normalize(a);
        expect(validateAction(a)).toEqual({ ok: true });
        expect(normalize(a)).toEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('fixed examples: boundary-adjacent, NaN, Infinity, and string values are rejected, not clamped', () => {
    const cases: unknown[] = [
      { type: 'grasp', force: 40.0000001 },
      { type: 'grasp', force: Number.NaN },
      { type: 'pull', distance: Number.POSITIVE_INFINITY, speed: 0.1 },
      { type: 'reach', target: [0, 0.3, 'x'], speed: 0.3 },
      { type: 'reach', target: [0, 0.3, 0.2], speed: 0.6000001 },
    ];
    for (const a of cases) expect(validateAction(a).ok).toBe(false);
  });

  describe('world.step', () => {
    let module: MuJoCoModule;
    beforeAll(async () => {
      module = await loadMujoco();
    }, 60_000);

    it('returns success: false with an error and an equal state, and does not throw', async () => {
      const world = await createGhostHandWorld({ mujoco: module });
      try {
        await fc.assert(
          fc.asyncProperty(
            fc.array(validAction, { minLength: 0, maxLength: 2 }),
            invalidAction,
            async (prefix, bad) => {
              let state = await world.snapshot();
              const ids = [state.id];
              for (const a of prefix) {
                state = await world.step(state, a);
                ids.push(state.id);
              }
              const inputBefore = normalize(state.state);
              const badBefore = normalize(bad);
              let out;
              try {
                out = await world.step(state, bad as GhostHandAction);
              } catch (error) {
                throw new Error(`step threw for an invalid action: ${String(error)}`);
              }
              ids.push(out.id);
              expect(out.result.success).toBe(false);
              if (!out.result.success) expect(out.result.error.length).toBeGreaterThan(0);
              expect(normalize(out.state)).toEqual(inputBefore);
              expect(normalize(state.state)).toEqual(inputBefore); // input not mutated
              expect(normalize(bad)).toEqual(badBefore); // action not mutated
              world.releaseTraces(ids);
            },
          ),
          { numRuns: ENGINE_RUNS },
        );
      } finally {
        world.dispose();
      }
    }, RUN_TIMEOUT_MS);
  });
});
