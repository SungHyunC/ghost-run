import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import type { SqlRequest, SqlResponse, SqlRunner } from '../src/sql/executor';
import { createWatchdogExecutor } from '../src/sql/watchdog';

const WORKER_FILE = fileURLToPath(new URL('./support/sql-worker.mjs', import.meta.url));
const RECURSIVE_SQL =
  'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c;';

function spawnWorkerRunner(): SqlRunner {
  const worker = new Worker(WORKER_FILE);
  let nextId = 1;
  return {
    run(request: SqlRequest): Promise<SqlResponse> {
      const id = nextId++;
      return new Promise<SqlResponse>((resolve, reject) => {
        worker.on('message', (m: { id?: number; response?: SqlResponse }) => {
          if (m.id === id && m.response) resolve(m.response);
        });
        worker.once('error', reject);
        worker.postMessage({ id, request });
      });
    },
    terminate(): void {
      void worker.terminate();
    },
  };
}

describe('watchdog over a real worker_threads sql.js runner', () => {
  it('times out a runaway query, then answers SELECT 1 on a fresh worker', async () => {
    const exec = createWatchdogExecutor({ spawn: spawnWorkerRunner, timeoutMs: 300 });
    try {
      const slow = await exec.run({ dbBytes: null, sql: RECURSIVE_SQL, outputLimit: 1000 });
      expect(slow).toEqual({ ok: false, stderr: 'sql statement exceeded the watchdog', watchdog: true });

      const fast = await exec.run({ dbBytes: null, sql: 'SELECT 1', outputLimit: 1000 });
      expect(fast.ok).toBe(true);
      if (fast.ok) expect(fast.stdout).toBe('1\n');
    } finally {
      exec.dispose();
    }
  }, 20000);
});
