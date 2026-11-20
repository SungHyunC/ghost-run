// Wiring of the light chunk (Shell and Cloud). The SQL worker runs sql.js under the app's watchdog,
// so a runaway statement cannot freeze the page. No other file imports this module statically.

import { createWatchdogExecutor } from '@ghost-run/playground-shell';
import shellWardsText from '../../../apps/ghost-shell/wards.yaml?raw';
import cloudWardsText from '../../../worlds/ghost-cloud/wards.yaml?raw';
import { createWorkerRunner } from '../../../apps/ghost-shell/src/sql-worker/worker-runner';
import { createCloudEngine } from './cloud';
import { createShellEngine } from './shell';
import type { LightEngines } from './types';

export function createLightEngines(): Promise<LightEngines> {
  const sql = createWatchdogExecutor({ spawn: () => createWorkerRunner() });
  const shell = createShellEngine({ sql, wardsText: shellWardsText });
  const cloud = createCloudEngine({ wardsText: cloudWardsText });
  return Promise.resolve({
    shell,
    cloud,
    dispose() {
      shell.dispose();
      cloud.dispose();
    },
  });
}
