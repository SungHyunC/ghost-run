import '@ghost-run/ui/styles.css';
import './page.css';
import { createRoot } from 'react-dom/client';
import { createGhostHandWorld } from '@ghost-run/drawer-arm';
import wardsText from '@ghost-run/drawer-arm/wards.yaml?raw';
import variantConfigText from '../../../worlds/drawer-arm/variant-config.json?raw';
import golden from '../../../worlds/drawer-arm/tests/golden.json';
import { App } from './App';
import type { AppServices } from './App';
import { createExecutor } from './exec/select';
import type { WorkerLike } from './exec/pool';
import { createOverlayRenderer } from './overlay/renderer';

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

const createWorld: AppServices['createWorld'] = (opts) =>
  createGhostHandWorld({ recordFrames: opts?.recordFrames === true });

const services: AppServices = {
  clock: () => new Date(),
  createWorld,
  createExecutor: () =>
    createExecutor({
      factory: () => createWorld(),
      spawn: () =>
        new Worker(new URL('./worker/sim-worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
    }),
  createOverlay: createOverlayRenderer,
  download,
  wardsText,
  variantConfigText,
  goldenHash: golden.hash,
};

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Missing #root element');
}

createRoot(container).render(<App services={services} />);
