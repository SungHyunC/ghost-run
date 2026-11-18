import { pick } from './guards';
import type { IconId } from './icons';
import {
  ASSURANCE_DOCKER,
  ASSURANCE_PLAYGROUND,
  REASON_BOX_IMAGE_MISSING,
  REASON_DOCKER_UNAVAILABLE,
  STATIC_BANNER,
  STATUS_UNKNOWN,
  notApplicableText,
  notClaimed,
  CLAIMED_TEXT,
  NOT_CLAIMED_TEXT,
  REASON_NO_REHEARSAL,
  REASON_STEPS_NOT_REHEARSED,
} from './texts';

export type ClaimId = 'P1' | 'P5' | 'P6';
export type ClaimStatus = 'claimed' | 'not-claimed' | 'not-applicable';

export interface ClaimLine {
  readonly id: ClaimId;
  /** True iff `status` is `claimed`. Kept for callers that only need the boolean. */
  readonly claimed: boolean;
  readonly status: ClaimStatus;
  /** Visible text of the line, e.g. `P1 claimed`, `P5 NOT claimed`, `P6: not applicable to this world`. */
  readonly text: string;
  /** `check`, `ban`, or `not-applicable`: text plus icon, never color alone. */
  readonly icon: IconId;
}

export interface ClaimModel {
  readonly lines: readonly [ClaimLine, ClaimLine, ClaimLine];
  /** Condition A: mode is docker-box or playground AND p1Claimed === true. */
  readonly assuranceText: string | null;
  /** Set iff mode is static-analysis. */
  readonly staticBanner: string | null;
  /** Condition B: claims absent or malformed, or a sealed mode with P1, P5 or P6 neither claimed nor validly not applicable. */
  readonly notClaimedBanner: string | null;
  readonly unknownStatus: boolean;
}

function line(id: ClaimId, status: ClaimStatus): ClaimLine {
  if (status === 'claimed') return { id, claimed: true, status, text: `${id} ${CLAIMED_TEXT}`, icon: 'check' };
  if (status === 'not-applicable') return { id, claimed: false, status, text: notApplicableText(id), icon: 'not-applicable' };
  return { id, claimed: false, status, text: `${id} ${NOT_CLAIMED_TEXT}`, icon: 'ban' };
}

function allNotClaimed(): ClaimModel['lines'] {
  return [line('P1', 'not-claimed'), line('P5', 'not-claimed'), line('P6', 'not-claimed')];
}

/** Lowered-claim wording by reason; no reason (or a reason that only explains a static run) gives none. */
function loweredWording(reason: unknown): string {
  if (reason === 'static-analysis') return REASON_NO_REHEARSAL;
  if (reason === 'unsupported-step') return REASON_STEPS_NOT_REHEARSED;
  return '';
}

/**
 * Total: never returns Unreadable. A claim counts only when the supplied value is the boolean `true`.
 * A property is not applicable only when `notApplicable` is an array that contains the string 'P5' (resp. 'P6')
 * AND the claim flag is not the boolean `true` (a supplied true claim is shown as claimed). P1 is never not applicable.
 */
export function buildClaimModel(claims: unknown): ClaimModel {
  const p = pick(claims, 'mode', 'p1Claimed', 'p5Claimed', 'p6Claimed', 'reason', 'notApplicable');
  const mode = p?.mode;

  if (p !== null && mode === 'static-analysis') {
    const reason =
      p.reason === 'docker-unavailable'
        ? REASON_DOCKER_UNAVAILABLE
        : p.reason === 'box-image-missing'
          ? REASON_BOX_IMAGE_MISSING
          : '';
    return {
      lines: allNotClaimed(),
      assuranceText: null,
      staticBanner: STATIC_BANNER + reason,
      notClaimedBanner: null,
      unknownStatus: false,
    };
  }

  const validMode = mode === 'docker-box' || mode === 'playground';
  if (
    p === null ||
    !validMode ||
    typeof p.p1Claimed !== 'boolean' ||
    typeof p.p5Claimed !== 'boolean' ||
    typeof p.p6Claimed !== 'boolean'
  ) {
    // Condition A is independent of condition B: a sealed mode with p1Claimed === true keeps its text.
    const assuranceText =
      validMode && p?.p1Claimed === true ? (mode === 'docker-box' ? ASSURANCE_DOCKER : ASSURANCE_PLAYGROUND) : null;
    return {
      lines: allNotClaimed(),
      assuranceText,
      staticBanner: null,
      notClaimedBanner: `${STATUS_UNKNOWN} ${notClaimed(['P1', 'P5', 'P6'])}`,
      unknownStatus: true,
    };
  }

  const na = Array.isArray(p.notApplicable) ? (p.notApplicable as readonly unknown[]) : [];
  const status = (id: 'P5' | 'P6', flag: boolean): ClaimStatus =>
    flag ? 'claimed' : na.includes(id) ? 'not-applicable' : 'not-claimed';
  const l: ClaimModel['lines'] = [
    line('P1', p.p1Claimed ? 'claimed' : 'not-claimed'),
    line('P5', status('P5', p.p5Claimed)),
    line('P6', status('P6', p.p6Claimed)),
  ];
  const unclaimed = l.filter((x) => x.status === 'not-claimed').map((x) => x.id);
  return {
    lines: l,
    assuranceText: p.p1Claimed ? (mode === 'docker-box' ? ASSURANCE_DOCKER : ASSURANCE_PLAYGROUND) : null,
    staticBanner: null,
    notClaimedBanner: unclaimed.length > 0 ? notClaimed(unclaimed) + loweredWording(p.reason) : null,
    unknownStatus: false,
  };
}
