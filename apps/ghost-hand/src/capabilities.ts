// Capability probes (design D16, requirements 21.4). Whether PR-1, PR-2, and PR-3 have landed is
// decided by the behavior of the installed packages, never by a constant.
// Every probe is total: any exception or missing export means the capability is false.
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as core from '@ghost-run/core';
import * as ui from '@ghost-run/ui';
import { JOINT_LIMIT_INACTIVE_TEXT, PROVISIONAL_WORDING_TEXT } from './texts';

export interface Capabilities {
  /** PR-1: physics ward blocks on jointLimitExceeded / selfCollisionOccurred. */
  readonly jointSelfWard: boolean;
  /** PR-2: renderMessage accepts a context without `claims`, no lowered-claim line appended. */
  readonly claimsOptional: boolean;
  /** PR-3: Claim_Banner renders P5 / P6 as "not applicable". */
  readonly bannerNotApplicable: boolean;
}

/** Stable fragment of the lowered-claim line of the wards module. */
export const LOWERED_CLAIM_FRAGMENT = 'no ghost rehearsal took place';

type Ns = Readonly<Record<string, unknown>>;
// Dynamic access: a missing export must not break the typecheck or the import.
const coreNs = core as unknown as Ns;
const uiNs = ui as unknown as Ns;

function probeJointSelfWard(): boolean {
  try {
    const engine = coreNs['WardEngine'] as
      | { evaluate?: (report: unknown, wardSet: unknown) => unknown }
      | undefined;
    if (typeof engine?.evaluate !== 'function') return false;
    const wardSet = {
      wards: [
        {
          id: 'probe-physics',
          kind: 'physics',
          min_success_rate: 0,
          max_contact_force_n: 1e9,
          forbidden_contacts: [],
        },
      ],
    };
    const blocks = (field: 'jointLimitExceeded' | 'selfCollisionOccurred'): boolean => {
      const report = {
        snapshots: [],
        changes: [],
        effectsOutside: [],
        observedEvents: [],
        variantResults: [{ variantId: 'probe', success: true, [field]: true }],
      };
      const verdict = engine.evaluate!(report, wardSet) as { verdict?: unknown } | undefined;
      return verdict?.verdict === 'block';
    };
    // A partial landing (only one field blocks) is not a claim.
    return blocks('jointLimitExceeded') && blocks('selfCollisionOccurred');
  } catch {
    return false;
  }
}

function probeClaimsOptional(): boolean {
  try {
    const render = coreNs['renderMessage'];
    if (typeof render !== 'function') return false;
    const verdict = { verdict: 'pass', violations: [], notices: [] };
    const text: unknown = (render as (v: unknown, c: unknown) => unknown)(verdict, { wardCount: 1 });
    return typeof text === 'string' && !text.includes(LOWERED_CLAIM_FRAGMENT);
  } catch {
    return false;
  }
}

function probeBannerNotApplicable(): boolean {
  try {
    const candle = uiNs['Candle'];
    if (candle === undefined || candle === null) return false;
    // The PR-3 field is `notApplicable` on the claims value (IsolationClaims).
    const claims = {
      mode: 'playground',
      p1Claimed: true,
      p5Claimed: false,
      p6Claimed: false,
      notApplicable: ['P5', 'P6'],
    };
    const component = candle as (props: { claims: typeof claims }) => ReactElement | null;
    const html = renderToStaticMarkup(createElement(component, { claims }));
    return html.includes('not applicable');
  } catch {
    return false;
  }
}

export function probeCapabilities(): Capabilities {
  return {
    jointSelfWard: probeJointSelfWard(),
    claimsOptional: probeClaimsOptional(),
    bannerNotApplicable: probeBannerNotApplicable(),
  };
}

// ---- Fallback selection by capability (Req 8.7, 9.9, 10.1, 21.6) -------------------------------

export interface CapabilityTexts {
  /** Req 8.7: shown while PR-1 has not landed; null once it has. */
  readonly jointLimitInactive: string | null;
  /** Req 9.9: shown while PR-2 has not landed; null once it has. */
  readonly provisionalWording: string | null;
}

export function capabilityTexts(caps: Capabilities): CapabilityTexts {
  return {
    jointLimitInactive: caps.jointSelfWard ? null : JOINT_LIMIT_INACTIVE_TEXT,
    provisionalWording: caps.claimsOptional ? null : PROVISIONAL_WORDING_TEXT,
  };
}

/** Req 9.9: context for `renderMessage`; without PR-2 the `claims` value is required by the type. */
export function messageContextFor(
  caps: Capabilities,
  wardCount: number,
): { readonly wardCount: number; readonly claims?: { readonly p5: false; readonly p6: false } } {
  return caps.claimsOptional ? { wardCount } : { wardCount, claims: { p5: false, p6: false } };
}

export interface GhostHandIsolationClaims {
  readonly mode: 'playground';
  readonly p1Claimed: boolean;
  readonly p5Claimed: false;
  readonly p6Claimed: false;
  readonly notApplicable?: readonly ['P5', 'P6'];
}

/** Req 10.1: P5 and P6 are never claimed; the PR-3 field is added only when the banner supports it. */
export function isolationClaimsFor(p1Claimed: boolean, caps: Capabilities): GhostHandIsolationClaims {
  const base = { mode: 'playground', p1Claimed, p5Claimed: false, p6Claimed: false } as const;
  return caps.bannerNotApplicable ? { ...base, notApplicable: ['P5', 'P6'] } : base;
}

/** May the README or page claim the joint-limit and self-collision ward? Only after PR-1 (Req 21.5). */
export function mayClaimJointSelfWard(caps: Capabilities): boolean {
  return caps.jointSelfWard;
}
