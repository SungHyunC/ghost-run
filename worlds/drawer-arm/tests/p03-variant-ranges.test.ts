// Feature: ghost-hand, Property 3: Variant parameters stay inside their ranges (GH-P3)
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 17.6**
// Claim scope: the Tested_Environments (P8, range part).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sampleVariant } from '../src/variant.js';
import { parseVariantConfig } from '../src/variant-config.js';
import type { Range, VariantConfig } from '../src/variant-config.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

// Finite doubles; "+ 0" turns -0 into 0 as the parser does.
const finite = fc.double({ noNaN: true, noDefaultInfinity: true }).map((v) => v + 0);

const rangeArb: fc.Arbitrary<Range> = fc
  .tuple(finite, finite)
  .map(([a, b]) => (a <= b ? { min: a, max: b } : { min: b, max: a }));

// The parser rejects a delay range with no whole number inside (out-of-range), so valid configs have one.
const delayRangeArb: fc.Arbitrary<Range> = rangeArb.filter((r) => Math.ceil(r.min) <= Math.floor(r.max));

const configArb: fc.Arbitrary<VariantConfig> = fc.record({
  format: fc.constant('ghost-hand-variants' as const),
  version: fc.constant(1 as const),
  defaultCount: fc.integer({ min: 1, max: 20 }),
  maxCount: fc.integer({ min: 1, max: 20 }),
  largeCountEnabled: fc.boolean(),
  defaultSeed: fc.integer({ min: 0, max: 4294967295 }),
  ranges: fc.record({
    drawerFrictionN: rangeArb,
    drawerMassKg: rangeArb,
    handleOffsetM: fc.record({ x: rangeArb, y: rangeArb, z: rangeArb }),
    sensorNoiseM: rangeArb,
    commandDelaySteps: delayRangeArb,
  }),
});

const seedArb = fc.integer({ min: 0, max: 4294967295 });
const indexArb = fc.integer({ min: 0, max: 19 });

function inside(name: string, v: number, r: Range): void {
  expect(Number.isFinite(v), `${name} is finite (got ${String(v)})`).toBe(true);
  expect(v >= r.min && v <= r.max, `${name} = ${String(v)} inside [${String(r.min)}, ${String(r.max)}]`).toBe(true);
}

function check(seed: number, index: number, config: VariantConfig): void {
  const p = sampleVariant(seed, index, config);
  const g = config.ranges;
  inside('drawerFrictionN', p.drawerFrictionN, g.drawerFrictionN);
  inside('drawerMassKg', p.drawerMassKg, g.drawerMassKg);
  inside('handleOffsetM.x', p.handleOffsetM[0], g.handleOffsetM.x);
  inside('handleOffsetM.y', p.handleOffsetM[1], g.handleOffsetM.y);
  inside('handleOffsetM.z', p.handleOffsetM[2], g.handleOffsetM.z);
  inside('sensorNoiseM', p.sensorNoiseM, g.sensorNoiseM);
  inside('commandDelaySteps', p.commandDelaySteps, g.commandDelaySteps);
  expect(Number.isInteger(p.commandDelaySteps), 'commandDelaySteps is an integer').toBe(true);
  expect(Number.isInteger(p.noiseSeed), 'noiseSeed is an integer').toBe(true);
  expect(p.noiseSeed >= 0 && p.noiseSeed <= 4294967295, 'noiseSeed in 0..4294967295').toBe(true);
}

describe('drawer-arm Variant_Sampler', () => {
  it(
    'Property 3 (GH-P3): Variant parameters stay inside their ranges',
    () => {
      fc.assert(
        fc.property(seedArb, indexArb, configArb, (seed, index, config) => {
          check(seed, index, config);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  // Shrunk counterexample from the first run, before the parser rejected a delay range with
  // no whole number: delay range [-5e-324, -5e-324], seed 0, index 0. No integer lies inside.
  it('Property 3 (GH-P3): a delay range without a whole number is rejected, not sampled', () => {
    const zero = { min: 0, max: 0 };
    const text = JSON.stringify({
      format: 'ghost-hand-variants',
      version: 1,
      defaultCount: 1,
      maxCount: 1,
      largeCountEnabled: false,
      defaultSeed: 0,
      ranges: {
        drawerFrictionN: zero,
        drawerMassKg: zero,
        handleOffsetM: { x: zero, y: zero, z: zero },
        sensorNoiseM: zero,
        commandDelaySteps: { min: -5e-324, max: -5e-324 },
      },
    });
    const parsed = parseVariantConfig(text);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.map((e) => [e.code, e.field])).toEqual([['out-of-range', 'ranges.commandDelaySteps']]);
  });
});
