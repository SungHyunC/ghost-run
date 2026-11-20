import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { formatCount, formatForce, formatRate } from '../../src/engine/format';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

describe('number formats (property)', () => {
  // Feature: site, Property 9: Number formats
  // **Validates: Requirements 10.5**
  it(
    'formatCount, formatForce and formatRate keep their shapes',
    () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (n) => {
          const s = formatCount(n);
          if (!/^\d{1,3}(,\d{3})*$/.test(s)) return false;
          return Number(s.replaceAll(',', '')) === n;
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );

      fc.assert(
        fc.property(fc.double({ min: 0, max: 1e6, noNaN: true }), (f) => {
          const s = formatForce(f);
          const m = /^(\d+\.\d) N$/.exec(s);
          if (m === null) return false;
          const parsed = Number(m[1]);
          return Math.abs(parsed - f) <= 0.05 + 1e-9;
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );

      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1_000_000 }).chain((total) =>
            fc.tuple(fc.constant(total), fc.integer({ min: 0, max: total })),
          ),
          ([total, ok]) => {
            const m = /^(\d+) of (\d+) = (\d+)%$/.exec(formatRate(ok, total));
            if (m === null) return false;
            const p = Number(m[3]);
            return (
              Number(m[1]) === ok &&
              Number(m[2]) === total &&
              Math.abs(p - (100 * ok) / total) <= 0.5 + 1e-9
            );
          },
        ),
        { numRuns: NUM_RUNS, verbose: true },
      );
    },
    PBT_TIMEOUT,
  );
});
