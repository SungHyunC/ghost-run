// Feature: ui-kit, Property 7: Claim honesty (static leg, tag UI-P7).
// **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { CandleView } from '../../src/components/Candle';
import { buildCandleModel } from '../../src/model/candle';
import { buildClaimModel } from '../../src/model/claims';
import {
  ASSURANCE_DOCKER,
  ASSURANCE_PLAYGROUND,
  REASON_BOX_IMAGE_MISSING,
  REASON_DOCKER_UNAVAILABLE,
  REASON_NO_REHEARSAL,
  REASON_STEPS_NOT_REHEARSED,
  STATIC_BANNER,
  STATUS_UNKNOWN,
  notApplicableText,
  notClaimed,
} from '../../src/model/texts';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';
import { renderMarkup } from '../support/markup';
import { claimsAny, claimsBucket } from '../fixtures/arbitraries';

type Rec = Record<string, unknown>;

function asRecord(v: unknown): Rec | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : null;
}

const verdictArb = fc.constantFrom<unknown>(undefined, 'pass', 'warn', 'block');

function renderCandle(verdict: unknown, claims: unknown): string {
  const v = verdict === undefined ? {} : { verdict, violations: [], notices: [] };
  const model = buildCandleModel(v);
  if (model.kind !== 'ok') throw new Error('unreadable verdict');
  return renderMarkup(<CandleView model={model} claims={buildClaimModel(claims)} />);
}

function paragraphs(html: string, kind: string): string[] {
  const re = new RegExp(`<p class="[^"]*" data-claim="${kind}">([^<]*)</p>`, 'g');
  return [...html.matchAll(re)].map((m) => m[1] ?? '');
}

function claimLines(html: string): { status: string; id: string; text: string }[] {
  const re = /<li class="gk-claim-line gk-claim-([a-z-]+)" data-claim-id="(P\d)">[\s\S]*?<span class="gk-claim-text gk-mono">([^<]*)<\/span>/g;
  return [...html.matchAll(re)].map((m) => ({ status: m[1] ?? '', id: m[2] ?? '', text: m[3] ?? '' }));
}

describe('UI-P7 static leg: claim honesty in the Candle container markup', () => {
  it('UI-P7: conditions A and B, not-applicable lines, Assurance_Text and the words sealed/isolated', () => {
    const counter = createCounter('UI-P7 static');
    console.log(`PBT seed=${PBT_SEED}`);
    fc.assert(
      fc.property(claimsAny, verdictArb, (claims, verdict) => {
        const html = renderCandle(verdict, claims);
        const r = asRecord(claims);
        const mode = r?.['mode'];
        const sealedMode = mode === 'docker-box' || mode === 'playground';
        const isStatic = mode === 'static-analysis';
        const flags = [r?.['p1Claimed'], r?.['p5Claimed'], r?.['p6Claimed']];
        const ids = ['P1', 'P5', 'P6'] as const;

        const assurance = paragraphs(html, 'assurance');
        const staticP = paragraphs(html, 'static');
        const notClaimedP = paragraphs(html, 'not-claimed');
        const lines = claimLines(html);
        expect(lines).toHaveLength(3);

        // Condition A: Assurance_Text iff sealed mode and p1Claimed is the boolean true; exact text of the mode.
        const condA = sealedMode && flags[0] === true;
        if (condA) expect(assurance).toEqual([mode === 'docker-box' ? ASSURANCE_DOCKER : ASSURANCE_PLAYGROUND]);
        else expect(assurance).toEqual([]);

        const malformed = !isStatic && (r === null || !sealedMode || flags.some((f) => typeof f !== 'boolean'));

        if (isStatic) {
          const reason =
            r?.['reason'] === 'docker-unavailable'
              ? REASON_DOCKER_UNAVAILABLE
              : r?.['reason'] === 'box-image-missing'
                ? REASON_BOX_IMAGE_MISSING
                : '';
          expect(staticP).toEqual([STATIC_BANNER + reason]);
          expect(notClaimedP).toEqual([]);
          expect(assurance).toEqual([]);
          lines.forEach((l) => {
            expect(l.status).toBe('not-claimed');
            expect(l.text).toBe(`${l.id} NOT claimed`);
          });
        } else {
          expect(staticP).toEqual([]);
          const naList = Array.isArray(r?.['notApplicable']) ? (r?.['notApplicable'] as unknown[]) : [];
          const isNa = (i: number): boolean => !malformed && i > 0 && flags[i] !== true && naList.includes(ids[i]);
          const unclaimed = ids.filter((_, i) => !(sealedMode && flags[i] === true && !malformed) && !isNa(i));
          // Condition B: banner iff malformed or at least one claim is neither claimed nor validly not applicable.
          const condB = malformed || unclaimed.length > 0;
          if (!condB) {
            expect(notClaimedP).toEqual([]);
          } else if (malformed) {
            expect(notClaimedP).toEqual([`${STATUS_UNKNOWN} ${notClaimed(['P1', 'P5', 'P6'])}`]);
          } else {
            const reason = r?.['reason'];
            const wording =
              reason === 'static-analysis' ? REASON_NO_REHEARSAL : reason === 'unsupported-step' ? REASON_STEPS_NOT_REHEARSED : '';
            expect(notClaimedP).toEqual([notClaimed(unclaimed) + wording]);
          }

          lines.forEach((l, i) => {
            expect(l.id).toBe(ids[i]);
            if (isNa(i)) {
              expect(l.status).toBe('not-applicable');
              expect(l.text).toBe(notApplicableText(ids[i] as string));
              expect(l.text).not.toContain('NOT claimed');
            } else if (!malformed && flags[i] === true) {
              expect(l.status).toBe('claimed');
              expect(l.text).toBe(`${ids[i]} claimed`);
            } else {
              expect(l.status).toBe('not-claimed');
              expect(l.text).toBe(`${ids[i]} NOT claimed`);
            }
          });
        }

        // The unknown-status text appears iff claims are absent or malformed.
        expect(html.includes(STATUS_UNKNOWN)).toBe(malformed || (!isStatic && r === null));

        // 'sealed' and 'isolated' appear only inside an Assurance_Text.
        const stripped = html.replace(/<p class="[^"]*" data-claim="assurance">[^<]*<\/p>/g, '');
        expect(/sealed|isolated/i.test(stripped)).toBe(false);

        counter.add(`mode:${typeof mode === 'string' && ['docker-box', 'static-analysis', 'playground'].includes(mode) ? mode : 'other'}`);
        counter.add(`AB:${claimsBucket(claims)}`);
        counter.add(`verdict:${verdict === undefined ? 'absent' : String(verdict)}`);
        if (lines.some((l) => l.status === 'not-applicable')) counter.add('notApplicable:shown');
        if (malformed) counter.add('unknown:shown');
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, [
      'mode:docker-box',
      'mode:playground',
      'mode:static-analysis',
      'mode:other',
      'AB:both',
      'AB:onlyA',
      'AB:onlyB',
      'verdict:absent',
      'verdict:pass',
      'verdict:warn',
      'verdict:block',
      'notApplicable:shown',
      'unknown:shown',
    ]);
  }, PBT_TIMEOUT);
});
