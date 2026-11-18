import { pick } from './guards';
import {
  ASSURANCE_DOCKER,
  ASSURANCE_PLAYGROUND,
  REASON_BOX_IMAGE_MISSING,
  REASON_DOCKER_UNAVAILABLE,
  STATIC_BANNER,
  STATUS_UNKNOWN,
  notClaimed,
} from './texts';

export interface ClaimLine {
  readonly id: 'P1' | 'P5' | 'P6';
  readonly claimed: boolean;
}

export interface ClaimModel {
  readonly lines: readonly [ClaimLine, ClaimLine, ClaimLine];
  /** Condition A: mode is docker-box or playground AND p1Claimed === true. */
  readonly assuranceText: string | null;
  /** Set iff mode is static-analysis. */
  readonly staticBanner: string | null;
  /** Condition B: claims absent or malformed, or a sealed mode with an unclaimed P1, P5 or P6. */
  readonly notClaimedBanner: string | null;
  readonly unknownStatus: boolean;
}

function lines(p1: boolean, p5: boolean, p6: boolean): ClaimModel['lines'] {
  return [
    { id: 'P1', claimed: p1 },
    { id: 'P5', claimed: p5 },
    { id: 'P6', claimed: p6 },
  ];
}

/** Total: never returns Unreadable. A claim counts only when the supplied value is the boolean `true`. */
export function buildClaimModel(claims: unknown): ClaimModel {
  const p = pick(claims, 'mode', 'p1Claimed', 'p5Claimed', 'p6Claimed', 'reason');
  const mode = p?.mode;

  if (p !== null && mode === 'static-analysis') {
    const reason =
      p.reason === 'docker-unavailable'
        ? REASON_DOCKER_UNAVAILABLE
        : p.reason === 'box-image-missing'
          ? REASON_BOX_IMAGE_MISSING
          : '';
    return {
      lines: lines(false, false, false),
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
      lines: lines(false, false, false),
      assuranceText,
      staticBanner: null,
      notClaimedBanner: `${STATUS_UNKNOWN} ${notClaimed(['P1', 'P5', 'P6'])}`,
      unknownStatus: true,
    };
  }

  const l = lines(p.p1Claimed, p.p5Claimed, p.p6Claimed);
  const unclaimed = l.filter((x) => !x.claimed).map((x) => x.id);
  return {
    lines: l,
    assuranceText: p.p1Claimed ? (mode === 'docker-box' ? ASSURANCE_DOCKER : ASSURANCE_PLAYGROUND) : null,
    staticBanner: null,
    notClaimedBanner: unclaimed.length > 0 ? notClaimed(unclaimed) : null,
    unknownStatus: false,
  };
}
