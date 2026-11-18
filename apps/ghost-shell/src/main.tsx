import { parseWards } from '@ghost-run/wards-config';
import { createRoot } from 'react-dom/client';
import wardsText from '../wards.yaml?raw';
import { createWorkerRunner } from './sql-worker/worker-runner';

// Temporary spike (task 3.3): proves yaml and the worker bundle for the browser. Replaced by the real page later.
const parsed = parseWards(wardsText);
const runner = createWorkerRunner();
void runner.run({ dbBytes: null, sql: 'SELECT 1', outputLimit: 4096 });

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(<p>Ghost Shell: {parsed.ok ? 'wards parsed' : 'wards invalid'}</p>);
}
