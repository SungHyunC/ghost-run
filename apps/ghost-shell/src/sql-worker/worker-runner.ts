// Main-thread side of the SQL worker: correlates replies by id; terminate() kills the worker.
import type { SqlRequest, SqlResponse, SqlRunner } from '@ghost-run/playground-shell';

interface OutMessage {
  readonly id: number;
  readonly response: SqlResponse;
}

export function createWorkerRunner(): SqlRunner {
  const worker = new Worker(new URL('./worker-entry.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, (response: SqlResponse) => void>();
  let nextId = 1;

  worker.onmessage = (event: MessageEvent<OutMessage>): void => {
    const resolve = pending.get(event.data.id);
    if (resolve === undefined) return;
    pending.delete(event.data.id);
    resolve(event.data.response);
  };

  return {
    run(request: SqlRequest): Promise<SqlResponse> {
      const id = nextId;
      nextId += 1;
      return new Promise<SqlResponse>((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ id, request });
      });
    },
    terminate(): void {
      worker.terminate();
      pending.clear();
    },
  };
}
