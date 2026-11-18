// Req 10.1: P5 and P6 are never claimed; the PR-3 field is added only when the banner supports it.
import type { IsolationClaims } from '@ghost-run/ui';
import type { Capabilities } from '../capabilities';

/** The one place that knows the PR-3 field (`notApplicable`, as defined by IsolationClaims). */
function withNotApplicable(base: IsolationClaims): IsolationClaims {
  return { ...base, notApplicable: ['P5', 'P6'] };
}

export function buildIsolationClaims(p1Claimed: boolean, caps: Capabilities): IsolationClaims {
  const base: IsolationClaims = { mode: 'playground', p1Claimed, p5Claimed: false, p6Claimed: false };
  return caps.bannerNotApplicable ? withNotApplicable(base) : base;
}
