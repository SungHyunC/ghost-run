// Feature: ghost-hand, Property 8: Marking a variant as failed never lowers the verdict (GH-P8)
// **Validates: Requirements 8.5, 9.6, 18.2**
import { VERDICT_ORDER, WardEngine } from '@ghost-run/core';
import type { GhostReport, Verdict, VariantResult, Ward, WardSet } from '@ghost-run/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyVerdictFloor } from '../../src/pipeline/verdict.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';

const opt = <T>(a: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> => fc.option(a, { nil: undefined });

const resultArb = (index: number): fc.Arbitrary<VariantResult> =>
  fc
    .record({
      success: fc.boolean(),
      contactForceN: opt(fc.double({ min: 0, max: 200, noNaN: true })),
      forbiddenContactOccurred: opt(fc.boolean()),
      jointLimitExceeded: opt(fc.boolean()),
      selfCollisionOccurred: opt(fc.boolean()),
    })
    .map((r) => ({
      variantId: `variant-${index}`,
      success: r.success,
      ...(r.contactForceN !== undefined ? { contactForceN: r.contactForceN } : {}),
      ...(r.forbiddenContactOccurred !== undefined ? { forbiddenContactOccurred: r.forbiddenContactOccurred } : {}),
      ...(r.jointLimitExceeded !== undefined ? { jointLimitExceeded: r.jointLimitExceeded } : {}),
      ...(r.selfCollisionOccurred !== undefined ? { selfCollisionOccurred: r.selfCollisionOccurred } : {}),
    }));

const resultsArb: fc.Arbitrary<VariantResult[]> = fc
  .integer({ min: 1, max: 20 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => resultArb(i))));

const physicsWardArb: fc.Arbitrary<Ward> = fc.record({
  id: fc.constant('physics-ward'),
  kind: fc.constant('physics' as const),
  min_success_rate: fc.double({ min: 0, max: 1, noNaN: true }),
  max_contact_force_n: fc.double({ min: 0, max: 200, noNaN: true }),
  forbidden_contacts: fc.subarray(['vase', 'cabinet', 'drawer', 'handle', 'floor']),
});

const wardSetArb: fc.Arbitrary<WardSet> = fc
  .array(physicsWardArb, { minLength: 1, maxLength: 3 })
  .map((ws) => ({ wards: ws.map((w, i) => ({ ...w, id: `physics-${i}` }) as Ward) }));

const report = (variantResults: readonly VariantResult[]): GhostReport<unknown> => ({
  snapshots: [],
  changes: [],
  effectsOutside: [],
  observedEvents: [],
  variantResults,
});

function check(results: VariantResult[], wardSet: WardSet, pos: number, p1Equal: boolean): void {
  const idx = pos % results.length;
  const failed = results.map((r, i) => (i === idx ? { ...r, success: false } : r));
  const before = WardEngine.evaluate(report(results), wardSet);
  const after = WardEngine.evaluate(report(failed), wardSet);
  expect(VERDICT_ORDER[after.verdict]).toBeGreaterThanOrEqual(VERDICT_ORDER[before.verdict]);
  const rank = (v: Verdict): number => VERDICT_ORDER[v];
  expect(rank(applyVerdictFloor(after, p1Equal).verdict)).toBeGreaterThanOrEqual(
    rank(applyVerdictFloor(before, p1Equal).verdict),
  );
}

describe('Property 8 (GH-P8): Marking a variant as failed never lowers the verdict', () => {
  it(
    'setting success to false on one result keeps or raises the verdict, with and without the floor',
    () => {
      fc.assert(
        fc.property(resultsArb, wardSetArb, fc.nat(), fc.boolean(), (rs, ws, pos, eq) => {
          check(rs, ws, pos, eq);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it('fixed example: the last passing variant failing moves pass to block at min_success_rate 1', () => {
    const ws: WardSet = {
      wards: [
        { id: 'p', kind: 'physics', min_success_rate: 1, max_contact_force_n: 100, forbidden_contacts: [] },
      ],
    };
    const rs: VariantResult[] = [{ variantId: 'variant-0', success: true }];
    expect(WardEngine.evaluate(report(rs), ws).verdict).toBe('pass');
    check(rs, ws, 0, true);
    expect(WardEngine.evaluate(report([{ variantId: 'variant-0', success: false }]), ws).verdict).toBe('block');
  });
});
