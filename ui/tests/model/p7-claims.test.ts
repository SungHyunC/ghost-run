// Feature: ui-kit, Property 7: Claim honesty (model leg, tag UI-P7).
// **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.9, 7.10, 7.11, 7.12**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { buildClaimModel } from '../../src/model/claims';
import {
  ASSURANCE_DOCKER,
  ASSURANCE_PLAYGROUND,
  REASON_NO_REHEARSAL,
  REASON_STEPS_NOT_REHEARSED,
  STATIC_BANNER,
  STATUS_UNKNOWN,
  notApplicableText,
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

  it('not applicable: P5 and P6 lines show the fixed text and never NOT claimed; only P5 and P6 can be listed', () => {
    const base = { mode: 'docker-box', p1Claimed: true, p5Claimed: false, p6Claimed: false };
    const m = buildClaimModel({ ...base, notApplicable: ['P5', 'P6'] });
    expect(m.notClaimedBanner).toBeNull();
    expect(m.lines.map((l) => l.text)).toEqual(['P1 claimed', notApplicableText('P5'), notApplicableText('P6')]);
    expect(m.lines.some((l) => l.text.includes('NOT claimed'))).toBe(false);
    expect(m.lines[1]?.icon).toBe('not-applicable');
    // P1 cannot be not applicable; unknown entries and non-arrays are ignored.
    const p1 = buildClaimModel({ ...base, p1Claimed: false, notApplicable: ['P1', 'P5', 'P6'] });
    expect(p1.lines[0]?.text).toBe('P1 NOT claimed');
    expect(p1.notClaimedBanner).toBe(notClaimed(['P1']));
    expect(buildClaimModel({ ...base, notApplicable: 'P5' }).notClaimedBanner).toBe(notClaimed(['P5', 'P6']));
    // A supplied true claim stays claimed even when listed (decision D16).
    const both = buildClaimModel({ ...base, p5Claimed: true, notApplicable: ['P5', 'P6'] });
    expect(both.lines[1]?.status).toBe('claimed');
    // Malformed flags are not rescued by the list; static analysis ignores it.
    expect(buildClaimModel({ ...base, p5Claimed: null, notApplicable: ['P5'] }).unknownStatus).toBe(true);
    expect(buildClaimModel({ ...base, mode: 'static-analysis', notApplicable: ['P5', 'P6'] }).lines.every((l) => l.status === 'not-claimed')).toBe(true);
  });

  it('lowered-claim wording follows the reason and only appears with a lowered claim', () => {
    const base = { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: false };
    expect(buildClaimModel({ ...base, reason: 'static-analysis' }).notClaimedBanner).toBe(`${notClaimed(['P6'])}${REASON_NO_REHEARSAL}`);
    expect(buildClaimModel({ ...base, reason: 'unsupported-step' }).notClaimedBanner).toBe(`${notClaimed(['P6'])}${REASON_STEPS_NOT_REHEARSED}`);
    expect(buildClaimModel({ ...base }).notClaimedBanner).toBe(notClaimed(['P6']));
    // P6 not applicable: nothing is lowered, so no wording.
    expect(buildClaimModel({ ...base, reason: 'unsupported-step', notApplicable: ['P6'] }).notClaimedBanner).toBeNull();
    // A static-analysis run keeps the no-rehearsal banner whatever the reason.
    const st = buildClaimModel({ ...base, mode: 'static-analysis', reason: 'unsupported-step' });
    expect(st.staticBanner).toBe(STATIC_BANNER);
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
          const naList = Array.isArray(r?.['notApplicable']) ? (r?.['notApplicable'] as unknown[]) : [];
          // Not applicable: only P5 or P6, only when listed, only with well-formed claims, and not when the flag is true.
          const isNa = (i: number): boolean => !malformed && i > 0 && flags[i] !== true && naList.includes(ids[i]);
          const unclaimed = ids.filter((_, i) => !(sealedMode && flags[i] === true) && !isNa(i));
          const condB = malformed || unclaimed.length > 0;

          expect(model.notClaimedBanner !== null).toBe(condB);
          expect(model.unknownStatus).toBe(malformed);
          if (malformed) {
            expect(model.notClaimedBanner).toBe(`${STATUS_UNKNOWN} ${notClaimed(['P1', 'P5', 'P6'])}`);
          } else if (condB) {
            const reason = r?.['reason'];
            const wording =
              reason === 'static-analysis' ? REASON_NO_REHEARSAL : reason === 'unsupported-step' ? REASON_STEPS_NOT_REHEARSED : '';
            expect(model.notClaimedBanner).toBe(notClaimed(unclaimed) + wording);
          }
          expect(model.notClaimedBanner?.includes(STATUS_UNKNOWN) ?? false).toBe(malformed);
          // A claim counts only when the supplied value is the boolean true.
          model.lines.forEach((l, i) => expect(l.claimed).toBe(!malformed && flags[i] === true));
          // Not-applicable lines show `P<n>: not applicable to this world` and never `NOT claimed`.
          model.lines.forEach((l, i) => {
            if (isNa(i)) {
              expect(l.text).toBe(notApplicableText(ids[i] as string));
              expect(l.text).not.toContain('NOT claimed');
            } else {
              expect(l.text).not.toContain('not applicable');
            }
          });
        }

        counter.add(`mode:${typeof mode === 'string' && ['docker-box', 'static-analysis', 'playground'].includes(mode) ? mode : 'other'}`);
        counter.add(`p1Claimed:${r?.['p1Claimed'] === true ? 'true' : 'not-true'}`);
        counter.add(`AB:${claimsBucket(claims)}`);
        const naBucket = asRecord(claims)?.['notApplicable'];
        if (Array.isArray(naBucket) && naBucket.some((x) => x === 'P5' || x === 'P6')) counter.add('notApplicable:valid');
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
      'notApplicable:valid',
    ]);
  }, PBT_TIMEOUT);
});
