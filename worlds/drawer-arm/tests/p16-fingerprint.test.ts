// Feature: ghost-hand, Property 16: Fingerprint is sensitive and stable
// **Validates: Requirements 3.11**
import { ghostRun } from '@ghost-run/core';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadMujoco } from '../src/engine/index.js';
import type { MuJoCoModule } from '../src/engine/index.js';
import { fingerprintOf } from '../src/fingerprint.js';
import { STATIC_LAYOUT } from '../src/layout.js';
import type { GhostHandAction, GhostHandState } from '../src/types.js';
import { createGhostHandWorld } from '../src/world.js';
import { ENGINE_RUNS } from './pbt-config.js';

const RUN_TIMEOUT_MS = 300_000;
const HEX64 = /^[0-9a-f]{64}$/;

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

const plan = fc.array(validAction, { minLength: 0, maxLength: 6 });

/** Flips one bit of the IEEE-754 pattern: a mantissa bit (0 to 51) or the sign bit (63). */
function flipDouble(x: number, bit: number): number {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x, true);
  const b = bit % 53 === 52 ? 63 : bit % 53;
  const i = b >> 3;
  dv.setUint8(i, dv.getUint8(i) ^ (1 << (b & 7)));
  return dv.getFloat64(0, true);
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Edit = (s: Mutable<GhostHandState>, pick: number, bit: number) => string[] | undefined;

/** One edit per tracked resource; returns the manifest keys that must change, or undefined if not applicable. */
const edits: Record<string, Edit> = {
  qpos: (s, p, b) => {
    const L = STATIC_LAYOUT.qpos;
    const i = L.offset + (p % L.length);
    s.integration[i] = flipDouble(s.integration[i] as number, b);
    return ['state/qpos', 'state/integration'];
  },
  qvel: (s, p, b) => {
    const L = STATIC_LAYOUT.qvel;
    const i = L.offset + (p % L.length);
    s.integration[i] = flipDouble(s.integration[i] as number, b);
    return ['state/qvel', 'state/integration'];
  },
  integration: (s, p, b) => {
    const i = p % s.integration.length;
    s.integration[i] = flipDouble(s.integration[i] as number, b);
    return ['state/integration'];
  },
  steps: (s, _p, b) => {
    s.steps = flipDouble(s.steps, b);
    return ['state/steps'];
  },
  jointTarget: (s, p, b) => {
    const t = [...s.controller.jointTarget];
    const i = p % t.length;
    t[i] = flipDouble(t[i] as number, b);
    s.controller = { ...s.controller, jointTarget: t };
    return ['state/controller'];
  },
  fingerForce: (s, _p, b) => {
    s.controller = { ...s.controller, fingerForceN: flipDouble(s.controller.fingerForceN, b) };
    return ['state/controller'];
  },
  holding: (s) => {
    s.controller = { ...s.controller, holding: !s.controller.holding };
    return ['state/controller'];
  },
  prng: (s, _p, b) => {
    s.prng = flipDouble(s.prng, b);
    return ['state/prng'];
  },
  delayBuffer: (s, p, b) => {
    if (s.delayBuffer.length === 0) return undefined;
    const d = [...s.delayBuffer];
    const i = p % d.length;
    d[i] = flipDouble(d[i] as number, b);
    s.delayBuffer = d;
    return ['state/delay'];
  },
  delayHead: (s, _p, b) => {
    s.delayHead = flipDouble(s.delayHead, b);
    return ['state/delay'];
  },
  variantScalar: (s, p, b) => {
    const keys = ['drawerFrictionN', 'drawerMassKg', 'sensorNoiseM', 'commandDelaySteps', 'noiseSeed'] as const;
    const k = keys[p % keys.length] as (typeof keys)[number];
    s.variant = { ...s.variant, [k]: flipDouble(s.variant[k], b) };
    return ['state/variant'];
  },
  handleOffset: (s, p, b) => {
    const h = [...s.variant.handleOffsetM] as [number, number, number];
    const i = p % 3;
    h[i] = flipDouble(h[i] as number, b);
    s.variant = { ...s.variant, handleOffsetM: h };
    return ['state/variant'];
  },
  maxContactForce: (s, _p, b) => {
    s.monitors = { ...s.monitors, maxContactForceN: flipDouble(s.monitors.maxContactForceN, b) };
    return ['state/monitors'];
  },
  touched: (s, p, b) => {
    if (s.monitors.touched.length === 0) return undefined;
    const t = [...s.monitors.touched];
    const i = p % t.length;
    const name = t[i] as string;
    if (name.length === 0) return undefined;
    const c = name.charCodeAt(0) ^ (1 << (b % 6));
    t[i] = String.fromCharCode(c) + name.slice(1);
    s.monitors = { ...s.monitors, touched: t };
    return ['state/monitors'];
  },
  jointLimitExceeded: (s) => {
    s.monitors = { ...s.monitors, jointLimitExceeded: !s.monitors.jointLimitExceeded };
    return ['state/monitors'];
  },
  jointLimitSteps: (s, _p, b) => {
    s.monitors = { ...s.monitors, jointLimitSteps: flipDouble(s.monitors.jointLimitSteps, b) };
    return ['state/monitors'];
  },
  selfCollisionOccurred: (s) => {
    s.monitors = { ...s.monitors, selfCollisionOccurred: !s.monitors.selfCollisionOccurred };
    return ['state/monitors'];
  },
  selfCollisionSteps: (s, _p, b) => {
    s.monitors = { ...s.monitors, selfCollisionSteps: flipDouble(s.monitors.selfCollisionSteps, b) };
    return ['state/monitors'];
  },
};
const editNames = Object.keys(edits);

describe('Property 16: Fingerprint is sensitive and stable', () => {
  let module: MuJoCoModule;
  beforeAll(async () => {
    module = await loadMujoco();
  }, 60_000);

  it('a single flipped bit changes its manifest entry and the total hash; equal states agree; values are 64 lowercase hex characters', async () => {
    const w = await createGhostHandWorld({ mujoco: module });
    try {
      await fc.assert(
        fc.asyncProperty(
          plan,
          fc.constantFrom(...editNames),
          fc.nat(1_000_000),
          fc.nat(52),
          async (actions, editName, pick, bit) => {
            const report = await ghostRun(w, await w.snapshot(), actions);
            try {
              const state = report.snapshots[report.snapshots.length - 1]!.state;
              const base = await fingerprintOf(state);
              // Format.
              expect(base.hash).toMatch(HEX64);
              for (const v of Object.values(base.manifest)) expect(v).toMatch(HEX64);
              // Equal states give equal fingerprints.
              expect(await fingerprintOf(structuredClone(state))).toEqual(base);
              // One flipped bit.
              const copy = structuredClone(state) as Mutable<GhostHandState>;
              const changed = (edits[editName] as Edit)(copy, pick, bit);
              if (changed === undefined) return;
              const after = await fingerprintOf(copy);
              expect(after.hash).toMatch(HEX64);
              expect(after.hash).not.toBe(base.hash);
              expect(Object.keys(after.manifest)).toEqual(Object.keys(base.manifest));
              for (const k of changed) expect(after.manifest[k]).not.toBe(base.manifest[k]);
              for (const v of Object.values(after.manifest)) expect(v).toMatch(HEX64);
            } finally {
              w.releaseTraces(report.snapshots.map((s) => s.id));
            }
          },
        ),
        { numRuns: ENGINE_RUNS },
      );
    } finally {
      w.dispose();
    }
  }, RUN_TIMEOUT_MS);

  it('fixed example: flipping the lowest bit of one qpos value changes the qpos entry and the total hash', async () => {
    const w = await createGhostHandWorld({ mujoco: module });
    try {
      const snap = await w.snapshot();
      const base = await fingerprintOf(snap.state);
      const copy = structuredClone(snap.state) as Mutable<GhostHandState>;
      const i = STATIC_LAYOUT.qpos.offset;
      copy.integration[i] = flipDouble(copy.integration[i] as number, 0);
      const after = await fingerprintOf(copy);
      expect(after.manifest['state/qpos']).not.toBe(base.manifest['state/qpos']);
      expect(after.hash).not.toBe(base.hash);
      expect(await fingerprintOf(structuredClone(snap.state))).toEqual(base);
    } finally {
      w.dispose();
    }
  }, RUN_TIMEOUT_MS);
});
