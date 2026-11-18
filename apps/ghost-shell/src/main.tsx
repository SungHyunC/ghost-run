import '@ghost-run/ui/styles.css';
import './page.css';
import { createWatchdogExecutor } from '@ghost-run/playground-shell';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { PageServices } from './controller';
import { createWorkerRunner } from './sql-worker/worker-runner';

const sql = createWatchdogExecutor({ spawn: () => createWorkerRunner() });

/** System clock, formatted YYYY-MM-DDTHH:MM:SSZ. */
function clock(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Offers text as a download of a Blob created in the page; no network call. */
function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const services: PageServices = {
  sql,
  clock,
  timers: {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => {
      globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
    },
  },
  download,
};

// Start the SQL worker at load with an init request so the first run is not delayed.
const sqlReady = sql.run({ dbBytes: null, sql: 'SELECT 1', outputLimit: 4096 }).then(
  (r) => r.ok,
  () => false,
);

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(<App services={services} sqlReady={sqlReady} />);
}
