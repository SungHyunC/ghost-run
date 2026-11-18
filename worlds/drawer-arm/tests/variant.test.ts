import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mix32, u32ToUnit, xorshift32 } from '../src/prng.js';
import type { GhostHandState } from '../src/types.js';
import { applyVariant, BASE_VARIANT_PARAMS, sampleVariant } from '../src/variant.js';
import { parseVariantConfig } from '../src/variant-config.js';
import type { VariantConfig } from '../src/variant-config.js';
import { NUM_RUNS } from './pbt-config.js';

// Validates: Requirements 6.2, 6.3, 6.8, 7.1

const parsed = parseVariantConfig(readFileSync(fileURLToPath(new URL('../variant-config.json', import.meta.url)), 'utf8'));
if (!parsed.ok) throw new Error('shipped variant-config.json does not parse');
const config: VariantConfig = parsed.config;

describe('mix32 (murmur3 finalizer)', () => {
  // Vectors computed with an independent reference (Python, 32-bit masked arithmetic).
  const vectors: [number, number][] = [
    [0x00000000, 0x00000000],
    [0x00000001, 0x514e28b7],
    [0x00000002, 0x30f4c306],
    [0x0000002a, 0x087fcd5c],
    [0xdeadbeef, 0x0de5c6a9],
    [0xffffffff, 0x81f16f39],
  ];
  it.each(vectors)('mix32(%i) = %i', (input, expected) => {
    expect(mix32(input)).toBe(expected);
  });

  it('treats negative and oversized inputs modulo 2^32', () => {
    expect(mix32(-1)).toBe(mix32(0xffffffff));
    expect(mix32(2 ** 32 + 1)).toBe(mix32(1));
  });
});

describe('xorshift32 and u32ToUnit', () => {
  it('known first steps from state 1 (13, 17, 5)', () => {
    expect(xorshift32(1)).toBe(270369);
    expect(xorshift32(270369)).toBe(67634689);
  });

  it('zero stays zero, nonzero never becomes zero', () => {
    expect(xorshift32(0)).toBe(0);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 0xffffffff }), (s) => {
        const n = xorshift32(s);
        return n !== 0 && n >= 0 && n <= 0xffffffff;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a long stream from a nonzero state never hits zero', () => {
    let s = 1;
    for (let i = 0; i < 100000; i++) {
      s = xorshift32(s);
      expect(s).not.toBe(0);
    }
  });

  it('u32ToUnit maps into [0, 1)', () => {
    expect(u32ToUnit(0)).toBe(0);
    expect(u32ToUnit(0xffffffff)).toBeLessThan(1);
    expect(u32ToUnit(0x80000000)).toBe(0.5);
  });
});

describe('sampleVariant', () => {
  it('is deterministic for the same (seed, index)', () => {
    expect(sampleVariant(42, 3, config)).toEqual(sampleVariant(42, 3, config));
  });

  it('gives different parameters for different indices with a fixed seed', () => {
    const seen = new Set<string>();
    for (let i = 0; i < config.maxCount; i++) seen.add(JSON.stringify(sampleVariant(42, i, config)));
    expect(seen.size).toBe(config.maxCount);
    expect(sampleVariant(42, 0, config)).not.toEqual(sampleVariant(42, 1, config));
  });

  it('gives different parameters for different seeds', () => {
    expect(sampleVariant(1, 0, config)).not.toEqual(sampleVariant(2, 0, config));
  });

  it('keeps every value inside its range and the noise seed nonzero', () => {
    const g = config.ranges;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 0, max: 19 }), (seed, index) => {
        const p = sampleVariant(seed, index, config);
        const inR = (v: number, r: { min: number; max: number }): boolean => v >= r.min && v <= r.max;
        return (
          inR(p.drawerFrictionN, g.drawerFrictionN) &&
          inR(p.drawerMassKg, g.drawerMassKg) &&
          inR(p.handleOffsetM[0], g.handleOffsetM.x) &&
          inR(p.handleOffsetM[1], g.handleOffsetM.y) &&
          inR(p.handleOffsetM[2], g.handleOffsetM.z) &&
          inR(p.sensorNoiseM, g.sensorNoiseM) &&
          Number.isInteger(p.commandDelaySteps) &&
          inR(p.commandDelaySteps, g.commandDelaySteps) &&
          Number.isInteger(p.noiseSeed) &&
          p.noiseSeed > 0 &&
          p.noiseSeed <= 0xffffffff
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('works for seed 0 and the largest seed', () => {
    for (const seed of [0, 0xffffffff]) {
      const p = sampleVariant(seed, 0, config);
      expect(p.noiseSeed).toBeGreaterThan(0);
    }
  });
});

describe('applyVariant', () => {
  const integration = new Float64Array([1, 2, 3]);
  const state: GhostHandState = {
    schema: 1,
    variant: BASE_VARIANT_PARAMS,
    steps: 5,
    integration,
    poses: new Float64Array(7),
    controller: { jointTarget: [0, 0, 0, 0, 0, 0], fingerForceN: 0, holding: false },
    prng: 1,
    delayBuffer: [],
    delayHead: 0,
    monitors: {
      maxContactForceN: 0,
      touched: [],
      jointLimitExceeded: false,
      jointLimitSteps: 0,
      selfCollisionOccurred: false,
      selfCollisionSteps: 0,
    },
  };

  it('leaves integration unchanged and does not mutate the input', () => {
    const params = sampleVariant(42, 2, config);
    const out = applyVariant(state, params);
    expect(out.integration).toBe(integration);
    expect(Array.from(out.integration)).toEqual([1, 2, 3]);
    expect(out.variant).toBe(params);
    expect(state.variant).toBe(BASE_VARIANT_PARAMS);
    expect(out.steps).toBe(5);
  });

  it('installs the noise seed and a zeroed delay ring of (delay + 1) slots', () => {
    const params = { ...sampleVariant(42, 2, config), commandDelaySteps: 3 };
    const out = applyVariant(state, params);
    expect(out.prng).toBe(params.noiseSeed);
    expect(out.delayHead).toBe(0);
    expect(out.delayBuffer).toHaveLength(4 * 7);
    expect(out.delayBuffer.every((v) => v === 0)).toBe(true);
  });
});
