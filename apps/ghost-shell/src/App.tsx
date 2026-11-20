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
import { APP_TITLE, HOME_LINK_HREF, HOME_LINK_TEXT, WARDS_DOWNLOAD_FILE_NAME } from './texts';
import { StringsContext } from './i18n/context';
import { STRINGS } from './i18n/strings';
import type { Locale } from './i18n/strings';
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
  /** Language of the page: English (index.html) unless ko.html asks for Korean. */
  readonly locale?: Locale;
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

export function App({ services, sqlReady, wardsText, locale }: AppProps) {
  const t = STRINGS[locale ?? 'en'];
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
    <StringsContext.Provider value={t}>
    <KitRoot initialTheme="dark">
      <main className="gs-page" lang={t.lang}>
        <header className="gs-hero">
          <p className="gs-brand">
            <GhostMark className="gs-brand-mark" />
            <span className="gs-brand-name">{t.brand}</span>
            <span className="gs-brand-sep" aria-hidden="true">
              /
            </span>
            <span className="gs-brand-app">{APP_TITLE}</span>
          </p>
          <div className="gs-hero-grid">
            <div className="gs-hero-copy">
              <p className="gs-hero-tags">
                <span className="gs-eyebrow">{t.eyebrow}</span>
                <a className="gs-lang" href={t.switchHref} hrefLang={t.switchLang} lang={t.switchLang}>
                  {t.switchLabel}
                </a>
                <a className="gs-lang" href={HOME_LINK_HREF}>
                  {HOME_LINK_TEXT}
                </a>
              </p>
              <h1>{APP_TITLE}</h1>
              <p className="gs-tagline">{t.tagline}</p>
            </div>
            <div className="gs-hero-side">
              <p className="gs-lead">{t.lead}</p>
              <ul className="gs-points">
                {t.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </header>

        <Notices state={state} sqlFailed={sqlFailed} dispatch={controller.dispatch} />

        <div className="gs-theater">
          <ScenarioBar state={state} dispatch={controller.dispatch} />
          <GhostFlow {...(flowRun === undefined ? {} : { run: flowRun })} />
        </div>

        <RunPanel run={state.run} />

        <div className="gs-block">
          <div className="gs-block-head">
            <p className="gs-step">{t.stepInspect}</p>
            <h2 className="gs-block-title">{t.inspectHeading}</h2>
            <p className="gs-section-intro">{t.inspectIntro}</p>
          </div>
          <PossessionPanel state={state} dispatch={controller.dispatch} />
          <GraveyardPanel state={state} dispatch={controller.dispatch} />
        </div>

        <div className="gs-block">
          <div className="gs-block-head">
            <p className="gs-step">{t.stepTools}</p>
            <h2 className="gs-block-title">{t.toolsHeading}</h2>
            <p className="gs-section-intro">{t.toolsIntro}</p>
          </div>
          <div className="gs-tools">
            <PlanPanel state={state} dispatch={controller.dispatch} />
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
          <span>{t.footer}</span>
        </footer>
      </main>
    </KitRoot>
    </StringsContext.Provider>
  );
}
