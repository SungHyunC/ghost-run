// Feature: ghost-hand, Property 19: Seed and count validation
// **Validates: Requirements 6.7, 6.8**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseSeedInput, validateVariantCount } from '../../src/inputs.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';

const SEED_MAX_BIG = 4294967295n;

// Independent oracle: ASCII digits only (leading zeros are still decimal text), value 0..2^32-1.
function seedOracle(text: string): boolean {
  return /^[0-9]+$/.test(text) && BigInt(text) <= SEED_MAX_BIG;
}

const nearBound = fc
  .tuple(
    fc.constantFrom(0n, 1n, SEED_MAX_BIG - 1n, SEED_MAX_BIG, SEED_MAX_BIG + 1n, SEED_MAX_BIG + 2n, 10n ** 12n),
    fc.integer({ min: -3, max: 3 }),
    fc.integer({ min: 0, max: 3 }),
    fc.constantFrom('', '-', '+', ' ', '\n', 'e3', '.0', 'x', '\u0661', '\u200b'),
    fc.boolean(),
  )
  .map(([base, delta, zeros, junk, junkFirst]) => {
    const v = base + BigInt(delta);
    const digits = '0'.repeat(zeros) + (v < 0n ? '0' : v.toString());
    return junkFirst ? junk + digits : digits + junk;
  });

const seedText = fc.oneof(
  { weight: 3, arbitrary: nearBound },
  { weight: 1, arbitrary: fc.string({ maxLength: 14 }) },
  { weight: 1, arbitrary: fc.stringMatching(/^[0-9]{1,12}$/) },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 12 }) },
);

function countOracle(count: number, def: number, max: number, large: boolean): boolean {
  return Number.isInteger(count) && count >= 1 && (count <= def || (large && count <= max));
}

describe('Property 19: Seed and count validation', () => {
  it(
    'Property 19: seed accepted iff decimal text of an integer in 0..4294967295',
    () => {
      fc.assert(
        fc.property(seedText, (text) => {
          const r = parseSeedInput(text);
          const expected = seedOracle(text);
          expect(r.ok).toBe(expected);
          if (r.ok) expect(BigInt(r.seed)).toBe(BigInt(text));
          else expect(r.error.length).toBeGreaterThan(0);
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'Property 19: count accepted iff 1..defaultCount or (largeCountEnabled and up to maxCount)',
    () => {
      const config = fc
        .tuple(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 20 }), fc.boolean())
        .map(([a, b, largeCountEnabled]) => ({
          defaultCount: Math.min(a, b),
          maxCount: Math.max(a, b),
          largeCountEnabled,
        }));
      const count = fc.oneof(
        fc.integer({ min: -3, max: 25 }),
        fc.integer(),
        fc.constantFrom(0.5, 1.5, NaN, Infinity, -Infinity, -0),
      );
      fc.assert(
        fc.property(config, count, (cfg, n) => {
          const r = validateVariantCount(n, cfg);
          expect(r.ok).toBe(countOracle(n, cfg.defaultCount, cfg.maxCount, cfg.largeCountEnabled));
          if (r.ok) expect(r.count).toBe(n);
          else expect(r.error.length).toBeGreaterThan(0);
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
    },
    PBT_TIMEOUT,
  );
});
