import type { IsolationClaims } from '../ui-imports';

export interface ClaimsInput {
  readonly p1Failed: boolean;
  readonly unsupportedSteps: readonly number[];
  readonly watchdogFired: boolean;
  readonly readCoverage: 'complete' | 'partial';
}

export type P2Note = { claimed: true } | { claimed: false; reason: 'unsupported-step' | 'watchdog' };

export interface ClaimsResult {
  readonly claims: IsolationClaims;
  readonly p2Note: P2Note;
}

/** Isolation claims of one playground run (Requirement 9). Pure; no `reason` is set. */
export function deriveClaims(input: ClaimsInput): ClaimsResult {
  const p1 = !input.p1Failed;
  const clean = p1 && input.unsupportedSteps.length === 0 && !input.watchdogFired;
  const claims: IsolationClaims = {
    mode: 'playground',
    p1Claimed: p1,
    p5Claimed: clean,
    p6Claimed: clean && input.readCoverage === 'complete',
  };
  let p2Note: P2Note = { claimed: true };
  if (input.unsupportedSteps.length > 0) p2Note = { claimed: false, reason: 'unsupported-step' };
  else if (input.watchdogFired) p2Note = { claimed: false, reason: 'watchdog' };
  return { claims, p2Note };
}
