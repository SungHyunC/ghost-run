import { escapeForDisplay as esc } from '@ghost-run/ui';
import type { SelfCheckResult } from '../self-check';
import { selfCheckText } from '../self-check';
import { DOCKER_TEXT, P1_FAILURE_TEXT, P5_P6_TEXT, P8_SCOPE_TEXT, unknownWardEntryText } from '../texts';
import { CLAIMS_HEADING, RESTORE_FAILED_TEXT } from '../ui-text';

export interface ClaimsPanelProps {
  /** Fixed notices from capabilities and the WardSet (joint-limit, provisional wording, no physics ward). */
  readonly notices: readonly string[];
  readonly unknownContactNames: readonly string[];
  readonly selfCheck: SelfCheckResult;
  /** True when the last run's two fingerprints differed. */
  readonly p1Failed: boolean;
}

/**
 * Claim and scope texts. No P2 text is rendered here: the P2 check lines live in ReferencePanel (texts.ts, P2_TEXT_ENABLED).
 */
export function ClaimsPanel({ notices, unknownContactNames, selfCheck, p1Failed }: ClaimsPanelProps) {
  const check = selfCheckText(selfCheck);
  return (
    <section className="gk-section" aria-label={CLAIMS_HEADING}>
      {p1Failed ? (
        <p role="alert" className="gh-error">
          <span aria-hidden="true">{'\u2715 '}</span>
          {P1_FAILURE_TEXT}
        </p>
      ) : null}
      <p>{P5_P6_TEXT}</p>
      <p>{DOCKER_TEXT}</p>
      {check !== null ? <p role="status">{check}</p> : null}
      {selfCheck.state === 'failed' && selfCheck.reason === 'restore-mismatch' ? (
        <p role="status">{RESTORE_FAILED_TEXT}</p>
      ) : null}
      <p>{P8_SCOPE_TEXT}</p>
      {notices.map((text) => (
        <p key={text} role="status">
          {text}
        </p>
      ))}
      {unknownContactNames.map((name) => (
        <p key={name} role="status" className="gh-mono">
          {esc(unknownWardEntryText(name))}
        </p>
      ))}
    </section>
  );
}
