import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPageController } from './controller';
import type { PageServices } from './controller';
import { PlanPanel } from './screens/PlanPanel';
import { GraveyardPanel } from './screens/GraveyardPanel';
import { PossessionPanel } from './screens/PossessionPanel';
import { WardsEditor } from './screens/WardsEditor';
import { WARDS_DOWNLOAD_FILE_NAME } from './texts';
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
      <main>
        <h1>Ghost Shell</h1>
        <Notices state={state} sqlFailed={sqlFailed} dispatch={controller.dispatch} />
        <ScenarioBar state={state} dispatch={controller.dispatch} />
        <PlanPanel state={state} dispatch={controller.dispatch} />
        <RunPanel run={state.run} />
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
