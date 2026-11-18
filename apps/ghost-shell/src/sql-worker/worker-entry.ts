// Web Worker: runs sql.js and answers { id, request } messages with { id, response }.
import { handleSqlRequest } from '@ghost-run/playground-shell';
import type { SqlRequest, SqlResponse } from '@ghost-run/playground-shell';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

interface InMessage {
  readonly id: number;
  readonly request: SqlRequest;
}

// Attach the listener first: top-level await would otherwise drop early messages.
const ready = initSqlJs({ locateFile: () => wasmUrl });

self.onmessage = (event: MessageEvent<InMessage>): void => {
  const { id, request } = event.data;
  void ready.then(
    (SQL) => {
      const response: SqlResponse = handleSqlRequest(SQL, request);
      self.postMessage({ id, response });
    },
    (err: unknown) => {
      const response: SqlResponse = { ok: false, stderr: `Error: ${err instanceof Error ? err.message : String(err)}` };
      self.postMessage({ id, response });
    },
  );
};
