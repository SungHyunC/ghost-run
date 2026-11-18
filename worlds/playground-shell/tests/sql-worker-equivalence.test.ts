import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import fc from 'fast-check';
import initSqlJs from 'sql.js';
import type { SqlJsStatic } from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleSqlRequest } from '../src/sql/handle';
import type { SqlRequest, SqlResponse } from '../src/sql/executor';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

// The Web Worker of apps/ghost-shell (src/sql-worker/worker-entry.ts) calls handleSqlRequest
// directly and has no copy of the logic, so covering handleSqlRequest covers it too.

const require = createRequire(import.meta.url);
const wasmPath: string = require.resolve('sql.js/dist/sql-wasm.wasm');
const WORKER_FILE = fileURLToPath(new URL('./support/sql-worker.mjs', import.meta.url));

let SQL: SqlJsStatic;
let worker: Worker;
let nextId = 1;
const pending = new Map<number, (r: SqlResponse) => void>();

function runInWorker(request: SqlRequest): Promise<SqlResponse> {
  const id = nextId++;
  return new Promise<SqlResponse>((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, request });
  });
}

function buildDb(sql: string): Uint8Array {
  const r = handleSqlRequest(SQL, { dbBytes: null, sql, outputLimit: 1000 });
  if (!r.ok) throw new Error(r.stderr);
  return r.dbBytes;
}

const SEED_SQL =
  "CREATE TABLE t (a INTEGER, b TEXT, c BLOB); INSERT INTO t VALUES (1, 'x', X'00FF10'), (2, NULL, NULL), (3, 'it''s', X'');" +
  'CREATE TABLE u (k INTEGER PRIMARY KEY, v REAL); INSERT INTO u VALUES (1, 1.5), (2, -0.25);';

let seedBytes: Uint8Array;

const intArb = fc.integer({ min: -5, max: 10 });
const sqlArb: fc.Arbitrary<string> = fc.oneof(
  intArb.map((n) => `SELECT * FROM t WHERE a > ${n};`),
  fc.constant('SELECT a, b, c FROM t ORDER BY a;'),
  fc.constant('SELECT count(*), sum(v), avg(v) FROM u;'),
  fc.tuple(intArb, fc.stringMatching(/^[a-z ]{0,6}$/)).map(([n, s]) => `INSERT INTO t (a, b) VALUES (${n}, '${s}');`),
  intArb.map((n) => `UPDATE t SET b = 'z' WHERE a <= ${n};`),
  intArb.map((n) => `DELETE FROM u WHERE k < ${n};`),
  fc.constant('CREATE TABLE w (x INTEGER); INSERT INTO w VALUES (1), (2);'),
  fc.constant('DROP TABLE t;'),
  fc.constant('SELECT x\'ABCD\' AS blob;'),
  fc.constant('SELECT 1; SELECT 2, \'two\';'),
  fc.constant(''),
  // Erroneous SQL.
  fc.constantFrom('SELEC 1;', 'SELECT * FROM missing;', 'INSERT INTO t VALUES (1', 'DROP TABLE nope;', 'CREATE TABLE t (a);', 'PRAGMA nonsense = ;'),
  fc.stringMatching(/^[A-Za-z0-9 ,;()*=<>'-]{0,30}$/),
);

const dbBytesArb: fc.Arbitrary<Uint8Array | null> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<Uint8Array | null>(null) },
  { weight: 4, arbitrary: fc.constant<'seed'>('seed').map(() => seedBytes) },
  // Bytes that are not a database: both implementations must report the same error.
  { weight: 1, arbitrary: fc.uint8Array({ minLength: 1, maxLength: 64 }) },
  { weight: 1, arbitrary: fc.uint8Array({ minLength: 0, maxLength: 0 }) },
);

const requestArb: fc.Arbitrary<SqlRequest> = fc
  .record({
    dbBytes: dbBytesArb,
    sql: sqlArb,
    outputLimit: fc.oneof(fc.constant(65536), fc.integer({ min: 0, max: 40 })),
  })
  .map((r) => ({ dbBytes: r.dbBytes, sql: r.sql, outputLimit: r.outputLimit }));

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => wasmPath });
  seedBytes = buildDb(SEED_SQL);
  worker = new Worker(WORKER_FILE);
  await new Promise<void>((resolve, reject) => {
    worker.once('error', reject);
    worker.on('message', (m: { id?: number; response?: SqlResponse; ready?: boolean }) => {
      if (m.ready === true) resolve();
      else if (m.id !== undefined && m.response !== undefined) pending.get(m.id)?.(m.response);
    });
  });
});

afterAll(async () => {
  await worker.terminate();
});

describe('sql-worker.mjs and handleSqlRequest', () => {
  // Feature: ghost-shell, Property: sql-worker.mjs equals handleSqlRequest
  it(
    'Property: sql-worker.mjs equals handleSqlRequest',
    async () => {
      await fc.assert(
        fc.asyncProperty(requestArb, async (request) => {
          // Each side gets its own copy of the bytes.
          const copy = (): SqlRequest => ({ ...request, dbBytes: request.dbBytes === null ? null : request.dbBytes.slice() });
          const fromWorker = await runInWorker(copy());
          const inProcess = handleSqlRequest(SQL, copy());
          expect(fromWorker).toEqual(inProcess);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it('fixed example: blobs, NULLs, and an error answer the same', async () => {
    for (const sql of ['SELECT * FROM t;', 'SELECT * FROM nope;', "INSERT INTO t (a) VALUES (9);"]) {
      const req: SqlRequest = { dbBytes: seedBytes.slice(), sql, outputLimit: 65536 };
      expect(await runInWorker({ ...req, dbBytes: seedBytes.slice() })).toEqual(handleSqlRequest(SQL, req));
    }
  });
});
