import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { NUM_RUNS } from '../pbt-config';
import { wardSetArb } from './ward-arbitraries';

describe('wardSetArb smoke test', () => {
  it('yields well-formed WardSets with unique ids', () => {
    fc.assert(
      fc.property(wardSetArb, (set) => {
        const ids = set.wards.map((w) => w.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(set.wards.length).toBeGreaterThan(0);
        for (const w of set.wards) {
          if (w.kind === 'path') expect(w.paths.length).toBeGreaterThan(0);
          if (w.kind === 'physics') {
            expect(w.min_success_rate).toBeGreaterThanOrEqual(0);
            expect(w.min_success_rate).toBeLessThanOrEqual(1);
          }
        }
        expect(JSON.stringify(set)).toMatch(/^[\x20-\x7e]*$/);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
