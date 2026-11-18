// Feature: ghost-hand, Property 15: Scene is JSON-safe
// **Validates: Requirements 3.10**
import { ghostRun } from '@ghost-run/core';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadMujoco } from '../src/engine/index.js';
import type { MuJoCoModule } from '../src/engine/index.js';
import { REFERENCE_PLAN } from '../src/reference-plan.js';
import type { GhostHandAction } from '../src/types.js';
import { createGhostHandWorld } from '../src/world.js';
import { ENGINE_RUNS } from './pbt-config.js';

const RUN_TIMEOUT_MS = 300_000;

// Valid actions inside the declared ranges (WORLD_CONFIG.actionRanges).
const num = (min: number, max: number): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((v) => v + 0);

const validAction: fc.Arbitrary<GhostHandAction> = fc.oneof(
  fc.record({
    type: fc.constant('reach' as const),
    target: fc.tuple(num(-0.3, 0.3), num(-0.3, 0.7), num(0.05, 0.7)),
    speed: num(0.05, 0.6),
  }),
  fc.record({ type: fc.constant('grasp' as const), force: num(2, 40) }),
  fc.record({ type: fc.constant('pull' as const), distance: num(0.02, 0.25), speed: num(0.05, 0.6) }),
  fc.constant({ type: 'release' as const }),
) as fc.Arbitrary<GhostHandAction>;

const plan = fc.array(validAction, { minLength: 0, maxLength: 20 });

/** Returns a description of the first violation found, or undefined. */
function findViolation(v: unknown, path: string): string | undefined {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return `${path}: not finite (${String(v)})`;
    if (Object.is(v, -0)) return `${path}: negative zero`;
    return undefined;
  }
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return `${path}: typed array or buffer`;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i += 1) {
      const r = findViolation(v[i], `${path}[${i}]`);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if (typeof v === 'object' && v !== null) {
    for (const [k, x] of Object.entries(v)) {
      const r = findViolation(x, `${path}.${k}`);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if (typeof v === 'function' || typeof v === 'undefined' || typeof v === 'symbol' || typeof v === 'bigint') {
    return `${path}: not JSON-safe (${typeof v})`;
  }
  return undefined;
}

describe('Property 15: Scene is JSON-safe', () => {
  let module: MuJoCoModule;
  beforeAll(async () => {
    module = await loadMujoco();
  }, 60_000);

  it('renders a JSON-safe Scene for every state reached by a generated plan', async () => {
    const w = await createGhostHandWorld({ mujoco: module });
    try {
      await fc.assert(
        fc.asyncProperty(plan, async (actions) => {
          const report = await ghostRun(w, await w.snapshot(), actions);
          try {
            for (const snap of report.snapshots) {
              const scene = w.render(snap);
              expect(findViolation(scene, 'scene')).toBeUndefined();
              expect(JSON.parse(JSON.stringify(scene))).toEqual(scene);
            }
          } finally {
            w.releaseTraces(report.snapshots.map((s) => s.id));
          }
        }),
        { numRuns: ENGINE_RUNS },
      );
    } finally {
      w.dispose();
    }
  }, RUN_TIMEOUT_MS);

  it('renders a JSON-safe Scene for every state of the reference plan', async () => {
    const w = await createGhostHandWorld({ mujoco: module });
    try {
      const report = await ghostRun(w, await w.snapshot(), REFERENCE_PLAN);
      for (const snap of report.snapshots) {
        const scene = w.render(snap);
        expect(findViolation(scene, 'scene')).toBeUndefined();
        expect(JSON.parse(JSON.stringify(scene))).toEqual(scene);
      }
      w.releaseTraces(report.snapshots.map((s) => s.id));
    } finally {
      w.dispose();
    }
  }, RUN_TIMEOUT_MS);

  it('the checker flags a typed array, -0 and a non-finite number', () => {
    expect(findViolation({ a: new Float64Array(1) }, 's')).toContain('typed array');
    expect(findViolation({ a: [-0] }, 's')).toContain('negative zero');
    expect(findViolation({ a: Number.NaN }, 's')).toContain('not finite');
    expect(findViolation({ a: [1, { b: 'x' }] }, 's')).toBeUndefined();
  });
});
