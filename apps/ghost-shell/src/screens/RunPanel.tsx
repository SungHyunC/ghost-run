import type { PlaygroundRun } from '../pipeline/run-playground';
import { useStrings } from '../i18n/context';
import type { Strings } from '../i18n/strings';
import { MirrorStage } from '../stage/MirrorStage';
import { Candle, MirrorWorld, escapeForDisplay } from '../ui-imports';
import { GhostMark } from './GhostMark';

export interface RunPanelProps {
  readonly run: PlaygroundRun | undefined;
}

function p2Text(run: PlaygroundRun, t: Strings): string {
  if (run.p2Note.claimed) return t.p2Meaning;
  return run.p2Note.reason === 'watchdog' ? t.p2NotClaimedWatchdog : t.p2NotClaimedUnsupported;
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
  const t = useStrings();
  const snapshots = run?.report.snapshots ?? [];
  const realScene = snapshots[0]?.state;
  const mirrorScene = snapshots[snapshots.length - 1]?.state;
  return (
    <section className="gk-section gs-run" aria-labelledby="gs-run-h" data-verdict={run?.verdict ?? 'none'}>
      <div className="gs-panel-head">
        <div>
          <p className="gs-step">{t.stepRun}</p>
          <h2 id="gs-run-h" className="gk-heading">{t.runHeading}</h2>
        </div>
        <p className="gs-badge">{t.dockerBoxNotUsed}</p>
      </div>
      {run === undefined ? (
        <div className="gs-empty">
          <GhostMark className="gs-empty-mark" />
          <p className="gs-empty-title">{t.noRun}</p>
          <p className="gs-empty-hint">{t.noRunHint}</p>
        </div>
      ) : (
        <>
          {run.p1Failed ? <p role="alert">{t.p1Failed}</p> : null}
          <div className="gs-verdict-row">
            <Candle verdict={run.wardVerdict} claims={run.claims} />
            <section aria-label={t.messagePanel} className="gs-message" data-verdict={run.verdict}>
              <h3 className="gk-subheading">{t.messagePanel}</h3>
              <pre className="gs-mono">{escapeForDisplay(run.message)}</pre>
            </section>
          </div>
          <MirrorStage key={runNumber(run)} run={run} />
          <div className="gs-details">
            <h3 className="gk-subheading">{t.runDetails}</h3>
            <MirrorWorld
              changes={run.report.changes}
              {...(realScene === undefined ? {} : { realScene })}
              {...(mirrorScene === undefined ? {} : { mirrorScene })}
              stepLabels={run.steps.map((s) => escapeForDisplay(s.command))}
            />
          </div>
          <p className="gs-fine">{p2Text(run, t)}</p>
          {run.unsupportedSteps.length > 0 ? <p className="gs-fine">{t.p5p6Scope}</p> : null}
        </>
      )}
    </section>
  );
}
