// Feature: ui-kit, Property 7: Claim honesty (model leg, tag UI-P7).
// **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.9**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { buildClaimModel } from '../../src/model/claims';
import {
  ASSURANCE_DOCKER,
  ASSURANCE_PLAYGROUND,
  STATIC_BANNER,
  STATUS_UNKNOWN,
  notClaimed,
} from '../../src/model/texts';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';
import { claimsAny, claimsBucket } from '../fixtures/arbitraries';

console.log(`UI-P7 model leg seed=${PBT_SEED}`);

type Rec = Record<string, unknown>;

function asRecord(v: unknown): Rec | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : null;
}

describe('UI-P7 model leg: claim honesty', () => {
  it('regression: sealed mode with p1Claimed true and a malformed p5Claimed still shows the Assurance_Text', () => {
    const model = buildClaimModel({ mode: 'docker-box', p1Claimed: true, p5Claimed: null, p6Claimed: true });
    expect(model.assuranceText).toBe(ASSURANCE_DOCKER);
    expect(model.notClaimedBanner).toBe(`${STATUS_UNKNOWN} ${notClaimed(['P1', 'P5', 'P6'])}`);
  });

  it('Assurance_Text (condition A) and the banner (condition B) follow the claims, independently', () => {
    const counter = createCounter('UI-P7 claims');
    fc.assert(
      fc.property(claimsAny, (claims) => {
        const model = buildClaimModel(claims);
        const r = asRecord(claims);
        const mode = r?.['mode'];
        const sealedMode = mode === 'docker-box' || mode === 'playground';
        const condA = sealedMode && r?.['p1Claimed'] === true;

        // Condition A: Assurance_Text iff sealed mode and p1Claimed is the boolean true; text matches the mode.
        if (condA) {
          expect(model.assuranceText).toBe(mode === 'docker-box' ? ASSURANCE_DOCKER : ASSURANCE_PLAYGROUND);
        } else {
          expect(model.assuranceText).toBeNull();
        }

        if (mode === 'static-analysis') {
          // A static-analysis value always gives the static banner and never an Assurance_Text.
          expect(model.staticBanner?.startsWith(STATIC_BANNER)).toBe(true);
          expect(model.assuranceText).toBeNull();
          expect(model.notClaimedBanner).toBeNull();
          expect(model.unknownStatus).toBe(false);
          expect(model.lines.every((l) => !l.claimed)).toBe(true);
        } else {
          expect(model.staticBanner).toBeNull();
          // Condition B: banner iff claims absent or malformed, or at least one of P1, P5, P6 is not claimed.
          const flags = [r?.['p1Claimed'], r?.['p5Claimed'], r?.['p6Claimed']];
          const ids = ['P1', 'P5', 'P6'] as const;
          const malformed = r === null || !sealedMode || flags.some((f) => typeof f !== 'boolean');
          const unclaimed = ids.filter((_, i) => !(sealedMode && flags[i] === true));
          const condB = malformed || unclaimed.length > 0;

          expect(model.notClaimedBanner !== null).toBe(condB);
          expect(model.unknownStatus).toBe(malformed);
          if (malformed) {
            expect(model.notClaimedBanner).toBe(`${STATUS_UNKNOWN} ${notClaimed(['P1', 'P5', 'P6'])}`);
          } else if (condB) {
            expect(model.notClaimedBanner).toBe(notClaimed(unclaimed));
          }
          expect(model.notClaimedBanner?.includes(STATUS_UNKNOWN) ?? false).toBe(malformed);
          // A claim counts only when the supplied value is the boolean true.
          model.lines.forEach((l, i) => expect(l.claimed).toBe(!malformed && flags[i] === true));
        }

        counter.add(`mode:${typeof mode === 'string' && ['docker-box', 'static-analysis', 'playground'].includes(mode) ? mode : 'other'}`);
        counter.add(`p1Claimed:${r?.['p1Claimed'] === true ? 'true' : 'not-true'}`);
        counter.add(`AB:${claimsBucket(claims)}`);
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, [
      'mode:docker-box',
      'mode:playground',
      'mode:static-analysis',
      'mode:other',
      'p1Claimed:true',
      'p1Claimed:not-true',
      'AB:both',
      'AB:onlyA',
      'AB:onlyB',
    ]);
  }, PBT_TIMEOUT);
});
