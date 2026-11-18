/**
 * Process-scoped reaper for boxes (container leak guard).
 *
 * `createBox` registers a run id before `docker run`; a confirmed removal unregisters it. Any
 * box still registered when the process exits, or receives SIGINT/SIGTERM, is removed with
 * `docker rm -f -v` selected by its `ghost-run.run-id` label (so only this process's boxes and
 * their anonymous volumes are touched). Tests call `reapRuns` from afterEach/afterAll to
 * remove boxes of a test that failed or timed out while a docker call was in flight.
 *
 * The sync path uses `spawnSync` because `exit` handlers cannot await.
 */
import { spawnSync } from 'node:child_process';
import type { DockerClient } from './cli.js';
import { removeRunContainers } from './box.js';
import { LABEL_RUN_ID } from './hardening.js';

const SYNC_BUDGET_MS = 4_000;
const active = new Set<string>();
let installed = false;

export function trackRun(runId: string): void {
  active.add(runId);
  install();
}

export function untrackRun(runId: string): void {
  active.delete(runId);
}

/** Run ids of boxes that were created and not yet confirmed removed. */
export function trackedRunIds(): string[] {
  return [...active];
}

/** Synchronous removal of the given runs (default: all tracked). Returns the run ids it handled. */
export function reapRunsSync(runIds: readonly string[] = trackedRunIds(), docker = 'docker'): string[] {
  const done: string[] = [];
  const deadline = Date.now() + SYNC_BUDGET_MS;
  for (const runId of runIds) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const ps = spawnSync(docker, ['ps', '-a', '-q', '--filter', `label=${LABEL_RUN_ID}=${runId}`], {
      encoding: 'utf8',
      timeout: left,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (ps.status !== 0) continue;
    const ids = ps.stdout.split('\n').map((s) => s.trim()).filter((s) => s !== '');
    let ok = true;
    for (const id of ids) {
      const rm = spawnSync(docker, ['rm', '-f', '-v', id], {
        timeout: Math.max(500, deadline - Date.now()),
        stdio: 'ignore',
      });
      if (rm.status !== 0) ok = false;
    }
    if (ok) {
      active.delete(runId);
      done.push(runId);
    }
  }
  return done;
}

/**
 * Async removal through the injected client. `runIds` defaults to every tracked run. Returns
 * the run ids whose removal failed.
 */
export async function reapRuns(client: DockerClient, runIds: readonly string[] = trackedRunIds()): Promise<string[]> {
  const failed: string[] = [];
  await Promise.all(
    runIds.map(async (runId) => {
      const r = await removeRunContainers(client, runId).catch(() => ({ ok: false }));
      if (r.ok) active.delete(runId);
      else failed.push(runId);
    }),
  );
  return failed;
}

function install(): void {
  if (installed) return;
  installed = true;
  process.on('exit', () => {
    if (active.size > 0) reapRunsSync();
  });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    const onSignal = (): void => {
      if (active.size > 0) reapRunsSync();
      // Re-raise only when nobody else handles the signal, so the default exit still happens.
      process.off(sig, onSignal);
      if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
    };
    process.on(sig, onSignal);
  }
}
