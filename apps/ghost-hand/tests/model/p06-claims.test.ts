// Feature: ghost-hand, Property 6: Claim honesty (GH-P6)
// **Validates: Requirements 9.6, 10.1, 10.2, 10.3**
import type { WardVerdict } from '@ghost-run/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Capabilities } from '../../src/capabilities.js';
import { applyVerdictFloor } from '../../src/pipeline/verdict.js';
import { buildIsolationClaims } from '../../src/pipeline/claims.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';

const hashArb = fc.stringMatching(/^[0-9a-f]{8,64}$/);

/** Pairs of fingerprint hashes, equal about half of the time. */
const pairArb: fc.Arbitrary<readonly [string, string]> = fc.oneof(
  hashArb.map((h) => [h, h] as const),
  fc.tuple(hashArb, hashArb),
);

const capsArb: fc.Arbitrary<Capabilities> = fc.record({
  jointSelfWard: fc.boolean(),
  claimsOptional: fc.boolean(),
  bannerNotApplicable: fc.boolean(),
});

const verdictArb: fc.Arbitrary<WardVerdict> = fc.record({
  verdict: fc.constantFrom('pass', 'warn', 'block') as fc.Arbitrary<'pass' | 'warn' | 'block'>,
  violations: fc.array(
    fc.record({
      wardId: fc.string({ minLength: 1, maxLength: 12 }),
      wardKind: fc.constantFrom('path', 'sql', 'egress', 'physics') as fc.Arbitrary<
        'path' | 'sql' | 'egress' | 'physics'
      >,
      reason: fc.string({ maxLength: 40 }),
    }),
    { maxLength: 5 },
  ),
  notices: fc.constant([]),
});

function checkClaims(a: string, b: string, caps: Capabilities): void {
  const equal = a === b;
  const claims = buildIsolationClaims(equal, caps);
  expect(claims.p1Claimed).toBe(equal);
  expect(claims.p5Claimed).toBe(false);
  expect(claims.p6Claimed).toBe(false);
  expect(claims.mode).toBe('playground');
  expect('reason' in claims).toBe(false);
}

function checkFloor(a: string, b: string, v: WardVerdict): void {
  const equal = a === b;
  const out = applyVerdictFloor(v, equal);
  if (equal) {
    expect(out).toEqual(v);
    return;
  }
  expect(out.verdict).toBe('block');
  expect(out.violations).toHaveLength(v.violations.length + 1);
  expect(out.violations.slice(0, v.violations.length)).toEqual(v.violations);
  expect(out.violations.filter((x) => x.wardId === 'isolation-check')).toHaveLength(
    v.violations.filter((x) => x.wardId === 'isolation-check').length + 1,
  );
}

describe('Property 6 (GH-P6): Claim honesty', () => {
  it(
    'claims follow the fingerprint pair and never claim P5 or P6; the floor blocks on a difference',
    () => {
      fc.assert(
        fc.property(pairArb, capsArb, verdictArb, ([a, b], caps, v) => {
          checkClaims(a, b, caps);
          checkFloor(a, b, v);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it('fixed example: equal hashes keep a pass verdict and claim P1', () => {
    const caps = { jointSelfWard: false, claimsOptional: false, bannerNotApplicable: false };
    checkClaims('abcd1234', 'abcd1234', caps);
    const v: WardVerdict = { verdict: 'pass', violations: [], notices: [] };
    expect(applyVerdictFloor(v, true)).toEqual(v);
  });

  it('fixed example: different hashes block even from a pass verdict, without a P1 claim', () => {
    const caps = { jointSelfWard: true, claimsOptional: true, bannerNotApplicable: true };
    checkClaims('abcd1234', 'abcd1235', caps);
    const out = applyVerdictFloor({ verdict: 'pass', violations: [], notices: [] }, false);
    expect(out.verdict).toBe('block');
    expect(out.violations.map((x) => x.wardId)).toEqual(['isolation-check']);
  });
});
