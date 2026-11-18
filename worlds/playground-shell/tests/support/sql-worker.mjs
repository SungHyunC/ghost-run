// Test-support worker (plain JavaScript: Node 20 cannot load TypeScript inside a worker).
// Re-implements handleSqlRequest in JS with the SqlRequest/SqlResponse shape.
// Receives { id, request: { dbBytes?, sql, outputLimit? } }, answers { id, response }.
import { createRequire } from 'node:module';
import { parentPort } from 'node:worker_threads';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');

const SQL = await initSqlJs({ locateFile: () => wasmPath });
const MIB = 1024 * 1024;

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function cell(v) {
  if (v === null || v === undefined) return '';
  if (ArrayBuffer.isView(v)) return `[blob ${v.byteLength} bytes]`;
  return String(v);
}

function format(results, limit) {
  let out = '';
  for (const r of results) {
    for (const row of r.values) {
      out += `${row.map(cell).join('|')}\n`;
      if (out.length >= limit) return out.slice(0, Math.max(0, limit));
    }
  }
  return out;
}

const quote = (n) => `"${n.replace(/"/g, '""')}"`;
const firstNumber = (res) => {
  const v = res[0]?.values[0]?.[0];
  return typeof v === 'number' ? v : null;
};

function handle(request) {
  let baseline;
  if (request.dbBytes == null) {
    const empty = new SQL.Database();
    baseline = empty.export();
    empty.close();
  } else {
    baseline = request.dbBytes;
  }
  const db = new SQL.Database(request.dbBytes ?? undefined);
  try {
    const pageSize = firstNumber(db.exec('PRAGMA page_size'));
    if (pageSize !== null && pageSize > 0) db.exec(`PRAGMA max_page_count = ${Math.floor(MIB / pageSize)}`);
    const results = db.exec(request.sql);
    const stdout = format(results, request.outputLimit ?? 65536);
    const names = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const tables = {};
    for (const row of names[0]?.values ?? []) {
      const name = String(row[0]);
      tables[name] = firstNumber(db.exec(`SELECT count(*) FROM ${quote(name)}`)) ?? 0;
    }
    const dbBytes = db.export();
    return { ok: true, stdout, dbBytes, tables, wrote: !bytesEqual(dbBytes, baseline) };
  } catch (e) {
    return { ok: false, stderr: `Error: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    db.close();
  }
}

parentPort.on('message', ({ id, request }) => {
  parentPort.postMessage({ id, response: handle(request) });
});

parentPort.postMessage({ ready: true });
