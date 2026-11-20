import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPageController } from './controller';
import type { PageServices } from './controller';
import { GhostFlow } from './flow/GhostFlow';
import type { FlowRun } from './flow/tour';
import type { PlaygroundRun } from './pipeline/run-playground';
import { PlanPanel } from './screens/PlanPanel';
import { GraveyardPanel } from './screens/GraveyardPanel';
import { PossessionPanel } from './screens/PossessionPanel';
import { WardsEditor } from './screens/WardsEditor';
import { APP_TAGLINE, APP_TITLE, WARDS_DOWNLOAD_FILE_NAME } from './texts';
import {
  APP_BRAND,
  APP_EYEBROW,
  FOOTER_TEXT,
  HERO_LEAD,
  HERO_POINTS,
  INSPECT_HEADING,
  INSPECT_INTRO,
  STAGE_INTRO,
  STEP_INSPECT_LABEL,
  STEP_RUN_LABEL,
} from './page-texts';
import { GhostMark } from './screens/GhostMark';
import { Notices } from './screens/Notices';
import { RunPanel } from './screens/RunPanel';
import { ScenarioBar } from './screens/ScenarioBar';
import { KitRoot, escapeForDisplay } from './ui-imports';

export interface AppProps {
  readonly services: PageServices;
  /** Resolves to false when the SQL engine failed to start. */
  readonly sqlReady?: Promise<boolean>;
  readonly wardsText?: string;
}

/** What the hero diagram needs from a run: its verdict, first command, and first reason (all display-escaped). */
function flowRunOf(run: PlaygroundRun | undefined): FlowRun | undefined {
  if (run === undefined) return undefined;
  const violation = run.wardVerdict.violations[0];
  const notice = run.wardVerdict.notices[0];
  const reason = violation !== undefined ? `${violation.wardId}: ${violation.reason}` : notice?.reason;
  return {
    verdict: run.verdict,
    command: escapeForDisplay(run.steps[0]?.command ?? ''),
    ...(reason === undefined ? {} : { reason: escapeForDisplay(reason) }),
    stepCount: run.steps.length,
  };
}

export function App({ services, sqlReady, wardsText }: AppProps) {
  const controller = useMemo(() => createPageController(services, wardsText), [services, wardsText]);
  useEffect(() => () => {
    controller.dispose();
  }, [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const [sqlFailed, setSqlFailed] = useState(false);
  useEffect(() => {
    if (sqlReady === undefined) return;
    let live = true;
    void sqlReady.then(
      (ok) => {
        if (live) setSqlFailed(!ok);
      },
      () => {
        if (live) setSqlFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [sqlReady]);
  const flowRun = useMemo(() => flowRunOf(state.run), [state.run]);

  return (
    <KitRoot initialTheme="dark">
      <main className="gs-page">
        <header className="gs-hero">
          <p className="gs-brand">
            <GhostMark className="gs-brand-mark" />
            <span className="gs-brand-name">{APP_BRAND}</span>
            <span className="gs-brand-sep" aria-hidden="true">
              /
            </span>
            <span className="gs-brand-app">{APP_TITLE}</span>
          </p>
          <div className="gs-hero-grid">
            <div className="gs-hero-copy">
              <p className="gs-eyebrow">{APP_EYEBROW}</p>
              <h1>{APP_TITLE}</h1>
              <p className="gs-tagline">{APP_TAGLINE}</p>
            </div>
            <div className="gs-hero-side">
              <p className="gs-lead">{HERO_LEAD}</p>
              <ul className="gs-points">
                {HERO_POINTS.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
          <GhostFlow {...(flowRun === undefined ? {} : { run: flowRun })} />
        </header>

        <Notices state={state} sqlFailed={sqlFailed} dispatch={controller.dispatch} />

        <ScenarioBar state={state} dispatch={controller.dispatch} />

        <div className="gs-block">
          <div className="gs-block-head">
            <p className="gs-step">{STEP_RUN_LABEL}</p>
            <p className="gs-section-intro">{STAGE_INTRO}</p>
          </div>
          <div className="gs-stage">
            <PlanPanel state={state} dispatch={controller.dispatch} />
            <RunPanel run={state.run} />
          </div>
        </div>

        <div className="gs-block">
          <div className="gs-block-head">
            <p className="gs-step">{STEP_INSPECT_LABEL}</p>
            <h2 className="gs-block-title">{INSPECT_HEADING}</h2>
            <p className="gs-section-intro">{INSPECT_INTRO}</p>
          </div>
          <GraveyardPanel state={state} dispatch={controller.dispatch} />
          <div className="gs-lower">
            <PossessionPanel state={state} dispatch={controller.dispatch} />
            <WardsEditor
              state={state}
              dispatch={controller.dispatch}
              onDownload={(text) => {
                services.download(WARDS_DOWNLOAD_FILE_NAME, text);
              }}
            />
          </div>
        </div>

        <footer className="gs-footer">
          <GhostMark className="gs-footer-mark" />
          <span>{FOOTER_TEXT}</span>
        </footer>
      </main>
    </KitRoot>
  );
}
