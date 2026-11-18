// Feature: ghost-hand, Property 2: Variant config round trip (GH-P2)
// **Validates: Requirements 7.3, 7.4**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseVariantConfig, printVariantConfig } from '../src/variant-config.js';
import type { Range, VariantConfig } from '../src/variant-config.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

// Finite doubles; "+ 0" turns -0 into 0 because the parser reads -0 back as 0.
const finite = fc.double({ noNaN: true, noDefaultInfinity: true }).map((v) => v + 0);

const rangeArb: fc.Arbitrary<Range> = fc
  .tuple(finite, finite)
  .map(([a, b]) => (a <= b ? { min: a, max: b } : { min: b, max: a }));

// The delay is a whole number of steps, so a valid delay range holds an integer.
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

function check(config: VariantConfig): void {
  const text = printVariantConfig(config);
  const parsed = parseVariantConfig(text);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.config).toEqual(config);
  expect(printVariantConfig(parsed.config)).toBe(text);
}

describe('drawer-arm Variant_Config', () => {
  it(
    'Property 2 (GH-P2): Variant config round trip',
    () => {
      fc.assert(
        fc.property(configArb, (config) => {
          check(config);
        }),
        { numRuns: NUM_RUNS, verbose: 1 },
      );
    },
    PBT_TIMEOUT,
  );

  it('Property 2 (GH-P2): fixed example with extreme and zero bounds', () => {
    check({
      format: 'ghost-hand-variants',
      version: 1,
      defaultCount: 1,
      maxCount: 20,
      largeCountEnabled: true,
      defaultSeed: 4294967295,
      ranges: {
        drawerFrictionN: { min: 0, max: 0 },
        drawerMassKg: { min: -Number.MAX_VALUE, max: Number.MAX_VALUE },
        handleOffsetM: {
          x: { min: Number.MIN_VALUE, max: 1e-7 },
          y: { min: -1e21, max: 1e21 },
          z: { min: 0.1, max: 0.30000000000000004 },
        },
        sensorNoiseM: { min: 0, max: 0.006 },
        commandDelaySteps: { min: 0, max: 6 },
      },
    });
  });
});
