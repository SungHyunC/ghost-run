import { DOCKER_BOX_NOT_USED_TEXT, MESSAGE_PANEL_LABEL, NO_RUN_TEXT, P1_FAILED_TEXT, P2_MEANING_TEXT, P2_NOT_CLAIMED_UNSUPPORTED_TEXT, P2_NOT_CLAIMED_WATCHDOG_TEXT, P5_P6_SCOPE_TEXT } from '../texts';
import type { PlaygroundRun } from '../pipeline/run-playground';
import { Candle, MirrorWorld, escapeForDisplay } from '../ui-imports';
import { NO_RUN_HINT_TEXT } from '../page-texts';
import { GhostMark } from './GhostMark';

export interface RunPanelProps {
  readonly run: PlaygroundRun | undefined;
}

function p2Text(run: PlaygroundRun): string {
  if (run.p2Note.claimed) return P2_MEANING_TEXT;
  return run.p2Note.reason === 'watchdog' ? P2_NOT_CLAIMED_WATCHDOG_TEXT : P2_NOT_CLAIMED_UNSUPPORTED_TEXT;
}

export function RunPanel({ run }: RunPanelProps) {
  const snapshots = run?.report.snapshots ?? [];
  const realScene = snapshots[0]?.state;
  const mirrorScene = snapshots[snapshots.length - 1]?.state;
  return (
    <section className="gk-section gs-run" aria-labelledby="gs-run-h">
      <div className="gs-panel-head">
        <h2 id="gs-run-h" className="gk-heading">Ghost run</h2>
        <p className="gs-badge">{DOCKER_BOX_NOT_USED_TEXT}</p>
      </div>
      {run === undefined ? (
        <div className="gs-empty">
          <GhostMark className="gs-empty-mark" />
          <p className="gs-empty-title">{NO_RUN_TEXT}</p>
          <p className="gs-empty-hint">{NO_RUN_HINT_TEXT}</p>
        </div>
      ) : (
        <>
          {run.p1Failed ? <p role="alert">{P1_FAILED_TEXT}</p> : null}
          <Candle verdict={run.wardVerdict} claims={run.claims} />
          <MirrorWorld
            changes={run.report.changes}
            {...(realScene === undefined ? {} : { realScene })}
            {...(mirrorScene === undefined ? {} : { mirrorScene })}
            stepLabels={run.steps.map((s) => escapeForDisplay(s.command))}
          />
          <section aria-label={MESSAGE_PANEL_LABEL} className="gs-message" data-verdict={run.verdict}>
            <h3 className="gk-subheading">{MESSAGE_PANEL_LABEL}</h3>
            <pre className="gs-mono">{escapeForDisplay(run.message)}</pre>
          </section>
          <p className="gs-fine">{p2Text(run)}</p>
          {run.unsupportedSteps.length > 0 ? <p className="gs-fine">{P5_P6_SCOPE_TEXT}</p> : null}
        </>
      )}
    </section>
  );
}
