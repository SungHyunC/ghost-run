import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPageController } from './controller';
import type { PageServices } from './controller';
import { PlanPanel } from './screens/PlanPanel';
import { GraveyardPanel } from './screens/GraveyardPanel';
import { PossessionPanel } from './screens/PossessionPanel';
import { WardsEditor } from './screens/WardsEditor';
import { APP_TAGLINE, APP_TITLE, WARDS_DOWNLOAD_FILE_NAME } from './texts';
import { Notices } from './screens/Notices';
import { RunPanel } from './screens/RunPanel';
import { ScenarioBar } from './screens/ScenarioBar';
import { KitRoot } from './ui-imports';

export interface AppProps {
  readonly services: PageServices;
  /** Resolves to false when the SQL engine failed to start. */
  readonly sqlReady?: Promise<boolean>;
  readonly wardsText?: string;
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

  return (
    <KitRoot initialTheme="dark">
      <main className="gs-page">
        <header className="gs-title">
          <h1>{APP_TITLE}</h1>
          <p className="gs-tagline">{APP_TAGLINE}</p>
        </header>
        <Notices state={state} sqlFailed={sqlFailed} dispatch={controller.dispatch} />
        <div className="gs-columns">
          <div className="gs-column">
            <ScenarioBar state={state} dispatch={controller.dispatch} />
            <PlanPanel state={state} dispatch={controller.dispatch} />
          </div>
          <div className="gs-column">
            <RunPanel run={state.run} />
          </div>
        </div>
        <GraveyardPanel state={state} dispatch={controller.dispatch} />
        <PossessionPanel state={state} dispatch={controller.dispatch} />
        <WardsEditor
          state={state}
          dispatch={controller.dispatch}
          onDownload={(text) => {
            services.download(WARDS_DOWNLOAD_FILE_NAME, text);
          }}
        />
      </main>
    </KitRoot>
  );
}
