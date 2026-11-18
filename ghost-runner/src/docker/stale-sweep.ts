/**
 * Stale-box sweep at run start (Req 16.7). Removes containers (and, with `rm -v`, their anonymous
 * `/ghost-rec` volumes) that carry the owner label `ghost-run.owner=<pid>:<start time>` of a dead
 * process, for example after SIGKILL of the host. Containers of a live foreign owner, of the
 * current process, and containers without the owner label are never touched.
 *
 * Runs once per process, outside the timed phases, with its own short timeouts. It never throws.
 */
import type { DockerClient } from './cli.js';
import { LABEL_OWNER, LABEL_RUN_ID } from './hardening.js';
import { processInfo, type ProcessInfo } from './owner.js';

export const STALE_LIST_TIMEOUT_MS = 3_000;
export const STALE_RM_TIMEOUT_MS = 4_000;
/** At most this many containers are removed per sweep, so the sweep stays short. */
export const STALE_MAX_REMOVALS = 20;

export interface StaleSweepResult {
  readonly removed: number;
  /** Set when the list call failed or a removal failed. */
  readonly error?: string;
}

export async function sweepStaleBoxes(client: DockerClient, info: ProcessInfo = processInfo()): Promise<StaleSweepResult> {
  try {
    const list = await client.run(
      [
        'ps', '-a',
        '--filter', `label=${LABEL_OWNER}`,
        '--format', `{{.ID}}\t{{.Label "${LABEL_OWNER}"}}\t{{.Label "${LABEL_RUN_ID}"}}`,
      ],
      { timeoutMs: STALE_LIST_TIMEOUT_MS },
    );
    if (list.code !== 0) {
      return { removed: 0, error: list.timedOut ? 'list timeout' : list.spawnError ?? `list exit ${String(list.code)}` };
    }
    const ids: string[] = [];
    for (const line of list.stdout.toString('utf8').split('\n')) {
      if (line.trim() === '') continue;
      const [id, owner, runId] = line.split('\t');
      if (id === undefined || id === '' || owner === undefined || owner === '' || runId === undefined || runId === '') continue;
      if (owner === info.owner || info.isAlive(owner)) continue;
      ids.push(id);
      if (ids.length >= STALE_MAX_REMOVALS) break;
    }
    let removed = 0;
    let failed = 0;
    for (const id of ids) {
      const r = await client.run(['rm', '-f', '-v', id], { timeoutMs: STALE_RM_TIMEOUT_MS });
      if (r.code === 0 || /no such container/i.test(r.stderr.toString('utf8'))) removed += 1;
      else failed += 1;
    }
    return failed > 0 ? { removed, error: `${String(failed)} removal(s) failed` } : { removed };
  } catch (e) {
    return { removed: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

let swept = false;

/** Runs the sweep the first time it is called in this process; later calls return undefined. */
export async function sweepStaleBoxesOnce(client: DockerClient): Promise<StaleSweepResult | undefined> {
  if (swept) return undefined;
  swept = true;
  return sweepStaleBoxes(client);
}

/** Test seam: allows the once-per-process sweep to run again. */
export function resetStaleSweepForTests(): void {
  swept = false;
}
