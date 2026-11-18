import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

const WORKER_FILE = fileURLToPath(new URL('./support/sql-worker.mjs', import.meta.url));
const RECURSIVE_SQL =
  'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c;';
const TIMEOUT_MS = 300;

interface WorkerReply {
  readonly id?: number;
  readonly ready?: boolean;
  readonly response?: { ok: boolean; stdout?: string; stderr?: string };
}

function spawn(): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER_FILE);
    w.once('error', reject);
    w.on('message', function onReady(m: WorkerReply) {
      if (m.ready === true) {
        w.off('message', onReady);
        w.off('error', reject);
        resolve(w);
      }
    });
  });
}

function ask(w: Worker, id: number, sql: string): Promise<WorkerReply> {
  return new Promise((resolve) => {
    w.on('message', function onMsg(m: WorkerReply) {
      if (m.id === id) {
        w.off('message', onMsg);
        resolve(m);
      }
    });
    w.postMessage({ id, request: { sql } });
  });
}

describe('worker_threads watchdog spike (real sql.js)', () => {
  it('terminates a runaway query on a real timer and respawns a working worker', async () => {
    const worker = await spawn();

    const start = performance.now();
    const outcome = await Promise.race([
      ask(worker, 1, RECURSIVE_SQL).then(() => 'query' as const),
      new Promise<'timer'>((resolve) => setTimeout(() => resolve('timer'), TIMEOUT_MS)),
    ]);
    expect(outcome).toBe('timer');

    let terminated = false;
    await worker.terminate().then(() => {
      terminated = true;
    });
    const elapsedMs = performance.now() - start;
    expect(terminated).toBe(true);
    console.log(`WORKER_SPIKE wait+terminate = ${elapsedMs.toFixed(1)} ms (timer ${TIMEOUT_MS} ms)`);

    const fresh = await spawn();
    const reply = await ask(fresh, 2, 'SELECT 1');
    expect(reply.response?.ok).toBe(true);
    expect(reply.response?.stdout).toBe('1\n');
    await fresh.terminate();
  }, 20000);
});
