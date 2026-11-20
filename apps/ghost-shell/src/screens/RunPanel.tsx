import { DOCKER_BOX_NOT_USED_TEXT, MESSAGE_PANEL_LABEL, NO_RUN_TEXT, P1_FAILED_TEXT, P2_MEANING_TEXT, P2_NOT_CLAIMED_UNSUPPORTED_TEXT, P2_NOT_CLAIMED_WATCHDOG_TEXT, P5_P6_SCOPE_TEXT } from '../texts';
import type { PlaygroundRun } from '../pipeline/run-playground';
import { NO_RUN_HINT_TEXT, RUN_DETAILS_HEADING, STEP_RUN_LABEL } from '../page-texts';
import { MirrorStage } from '../stage/MirrorStage';
import { Candle, MirrorWorld, escapeForDisplay } from '../ui-imports';
import { GhostMark } from './GhostMark';

export interface RunPanelProps {
  readonly run: PlaygroundRun | undefined;
}

function p2Text(run: PlaygroundRun): string {
  if (run.p2Note.claimed) return P2_MEANING_TEXT;
  return run.p2Note.reason === 'watchdog' ? P2_NOT_CLAIMED_WATCHDOG_TEXT : P2_NOT_CLAIMED_UNSUPPORTED_TEXT;
}

// Each run object gets its own number, so the mirror stage replays its picture for every new run.
const runNumbers = new WeakMap<PlaygroundRun, number>();
let lastRunNumber = 0;
function runNumber(run: PlaygroundRun): number {
  let n = runNumbers.get(run);
  if (n === undefined) {
    lastRunNumber += 1;
    n = lastRunNumber;
    runNumbers.set(run, n);
  }
  return n;
}

export function RunPanel({ run }: RunPanelProps) {
  const snapshots = run?.report.snapshots ?? [];
  const realScene = snapshots[0]?.state;
  const mirrorScene = snapshots[snapshots.length - 1]?.state;
  return (
    <section className="gk-section gs-run" aria-labelledby="gs-run-h" data-verdict={run?.verdict ?? 'none'}>
      <div className="gs-panel-head">
        <div>
          <p className="gs-step">{STEP_RUN_LABEL}</p>
          <h2 id="gs-run-h" className="gk-heading">Ghost run</h2>
        </div>
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
          <div className="gs-verdict-row">
            <Candle verdict={run.wardVerdict} claims={run.claims} />
            <section aria-label={MESSAGE_PANEL_LABEL} className="gs-message" data-verdict={run.verdict}>
              <h3 className="gk-subheading">{MESSAGE_PANEL_LABEL}</h3>
              <pre className="gs-mono">{escapeForDisplay(run.message)}</pre>
            </section>
          </div>
          <MirrorStage key={runNumber(run)} run={run} />
          <div className="gs-details">
            <h3 className="gk-subheading">{RUN_DETAILS_HEADING}</h3>
            <MirrorWorld
              changes={run.report.changes}
              {...(realScene === undefined ? {} : { realScene })}
              {...(mirrorScene === undefined ? {} : { mirrorScene })}
              stepLabels={run.steps.map((s) => escapeForDisplay(s.command))}
            />
          </div>
          <p className="gs-fine">{p2Text(run)}</p>
          {run.unsupportedSteps.length > 0 ? <p className="gs-fine">{P5_P6_SCOPE_TEXT}</p> : null}
        </>
      )}
    </section>
  );
}
