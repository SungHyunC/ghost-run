import { useId } from 'react';
import { escapeForDisplay as esc } from '@ghost-run/ui';
import { fixed } from '../format';
import { REFERENCE_SIMULATION_TEXT } from '../texts';
import {
  EXECUTE_REFERENCE_LABEL,
  REFERENCE_HEADING,
  REFERENCE_INITIAL_TEXT,
  REFERENCE_MOVED_NOTE,
  REFERENCE_MOVED_PREFIX,
  RESET_REFERENCE_LABEL,
} from '../ui-text';

export interface ReferencePanelProps {
  readonly canExecute: boolean;
  readonly canReset: boolean;
  /** Short reason shown when a pass was used or went stale; null otherwise. */
  readonly staleReason?: string | null;
  /** Final drawer displacement in meters once the reference arm has moved, otherwise null. */
  readonly displacementM: number | null;
  /** Lines of the P2 check; null while the P2 text is off or no check applies. */
  readonly p2Lines: readonly string[] | null;
  readonly onExecute: () => void;
  readonly onReset: () => void;
}

/** The Reference_Arm controls. The reference-simulation line is always shown here (requirement 10.10). */
export function ReferencePanel(props: ReferencePanelProps) {
  const headingId = useId();
  return (
    <section className="gk-section" aria-labelledby={headingId}>
      <h2 className="gk-heading" id={headingId}>
        {REFERENCE_HEADING}
      </h2>
      <p>{REFERENCE_SIMULATION_TEXT}</p>
      <div className="gh-actions">
        <button type="button" className="gk-button" disabled={!props.canExecute} onClick={props.onExecute}>
          {EXECUTE_REFERENCE_LABEL}
        </button>
        <button type="button" className="gk-button" disabled={!props.canReset} onClick={props.onReset}>
          {RESET_REFERENCE_LABEL}
        </button>
      </div>
      {props.staleReason === undefined || props.staleReason === null ? null : <p>{props.staleReason}</p>}
      <div role="status">
        {props.displacementM === null ? (
          <p>{REFERENCE_INITIAL_TEXT}</p>
        ) : (
          <>
            <p className="gh-mono">
              {REFERENCE_MOVED_PREFIX}
              {esc(fixed(props.displacementM, 4))}
            </p>
            <p>{REFERENCE_MOVED_NOTE}</p>
          </>
        )}
        {props.p2Lines === null ? null : props.p2Lines.map((line) => <p key={line}>{line}</p>)}
      </div>
    </section>
  );
}
