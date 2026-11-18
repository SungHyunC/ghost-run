// Feature: ghost-hand, Property 9: Forbidden-contact derivation is monotone and exact (GH-P9)
// **Validates: Requirements 8.4, 8.5, 8.6, 18.3**
import { WORLD_CONFIG } from '@ghost-run/drawer-arm';
import type { VariantOutcome } from '@ghost-run/drawer-arm';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deriveVariantResult } from '../../src/pipeline/derive.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';

const NAMES: readonly string[] = WORLD_CONFIG.contactNames;
const finite = (min: number, max: number): fc.Arbitrary<number> => fc.double({ min, max, noNaN: true });

const outcomeArb: fc.Arbitrary<VariantOutcome> = fc
  .record({
    index: fc.nat({ max: 1000 }),
    finalDrawerM: finite(-0.5, 0.5),
    maxContactForceN: finite(0, 500),
    touched: fc.subarray([...NAMES, 'ghost-body']),
    jointLimitExceeded: fc.boolean(),
    selfCollisionOccurred: fc.boolean(),
    failedSteps: fc.array(fc.nat({ max: 30 }), { maxLength: 4 }),
    engineError: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  })
  .map((r) => ({
    index: r.index,
    params: {
      drawerFrictionN: 1,
      drawerMassKg: 1,
      handleOffsetM: [0, 0, 0] as const,
      sensorNoiseM: 0,
      commandDelaySteps: 0,
      noiseSeed: 0,
    },
    finalDrawerM: r.finalDrawerM,
    monitors: {
      maxContactForceN: r.maxContactForceN,
      touched: r.touched,
      jointLimitExceeded: r.jointLimitExceeded,
      jointLimitSteps: 0,
      selfCollisionOccurred: r.selfCollisionOccurred,
      selfCollisionSteps: 0,
    },
    failedSteps: r.failedSteps,
    firstTouch: {},
    trajectoryHash: 'h',
    ...(r.engineError !== undefined ? { engineError: r.engineError } : {}),
  }));

const listArb = fc.subarray([...NAMES, 'ghost-body', 'unknown-name']);
/** A list and a superset of it. */
const listPairArb = fc
  .tuple(listArb, listArb)
  .map(([a, extra]) => [a, [...new Set([...a, ...extra])]] as const);

function check(o: VariantOutcome, small: readonly string[], big: readonly string[]): void {
  const r1 = deriveVariantResult(o, small);
  const r2 = deriveVariantResult(o, big);
  if (r1.forbiddenContactOccurred === true) expect(r2.forbiddenContactOccurred).toBe(true);
  expect(r1.forbiddenContactOccurred).toBe(o.monitors.touched.some((n) => small.includes(n)));
  expect(r2.forbiddenContactOccurred).toBe(o.monitors.touched.some((n) => big.includes(n)));
  if (o.failedSteps.length > 0 || o.engineError !== undefined) {
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
  }
  expect(r1.contactForceN).toBe(o.monitors.maxContactForceN);
  expect(r1.variantId).toBe(`variant-${o.index}`);
}

describe('Property 9 (GH-P9): Forbidden-contact derivation is monotone and exact', () => {
  it(
    'a larger forbidden list never clears a contact; the flag equals touched-meets-list',
    () => {
      fc.assert(
        fc.property(outcomeArb, listPairArb, (o, [small, big]) => {
          check(o, small, big);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it('fixed example: an engine error is never a success, even with a fully open drawer', () => {
    const o = {
      index: 3,
      params: {
        drawerFrictionN: 1,
        drawerMassKg: 1,
        handleOffsetM: [0, 0, 0],
        sensorNoiseM: 0,
        commandDelaySteps: 0,
        noiseSeed: 0,
      },
      finalDrawerM: 0.5,
      monitors: {
        maxContactForceN: 7,
        touched: ['vase'],
        jointLimitExceeded: false,
        jointLimitSteps: 0,
        selfCollisionOccurred: false,
        selfCollisionSteps: 0,
      },
      failedSteps: [],
      firstTouch: {},
      trajectoryHash: 'h',
      engineError: 'boom',
    } as const satisfies VariantOutcome;
    const r = deriveVariantResult(o, ['vase']);
    expect(r.success).toBe(false);
    expect(r.forbiddenContactOccurred).toBe(true);
    expect(r.variantId).toBe('variant-3');
    expect(r.contactForceN).toBe(7);
  });
});
