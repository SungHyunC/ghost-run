// Pure core of the SQL executor: a function of (dbBytes, sql) over an initialized sql.js module.
import type { SqlJsStatic } from 'sql.js';
import { formatResults } from './format';
import type { SqlRequest, SqlResponse } from './executor';

const MIB = 1024 * 1024;

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return `Error: ${message}`;
}

function firstNumber(results: readonly { values: readonly (readonly unknown[])[] }[]): number | null {
  const v = results[0]?.values[0]?.[0];
  return typeof v === 'number' ? v : null;
}

export function handleSqlRequest(SQL: SqlJsStatic, request: SqlRequest): SqlResponse {
  let baseline: Uint8Array;
  if (request.dbBytes === null) {
    const empty = new SQL.Database();
    baseline = empty.export();
    empty.close();
  } else {
    baseline = request.dbBytes;
  }
  const db = new SQL.Database(request.dbBytes ?? undefined);
  try {
    const pageSize = firstNumber(db.exec('PRAGMA page_size'));
    if (pageSize !== null && pageSize > 0) {
      db.exec(`PRAGMA max_page_count = ${Math.floor(MIB / pageSize)}`);
    }
    const results = db.exec(request.sql);
    const stdout = formatResults(results, request.outputLimit);
    const names = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const tables: Record<string, number> = {};
    for (const row of names[0]?.values ?? []) {
      const name = String(row[0]);
      tables[name] = firstNumber(db.exec(`SELECT count(*) FROM ${quoteIdent(name)}`)) ?? 0;
    }
    const dbBytes = db.export();
    return { ok: true, stdout, dbBytes, tables, wrote: !bytesEqual(dbBytes, baseline) };
  } catch (e) {
    return { ok: false, stderr: errorText(e) };
  } finally {
    db.close();
  }
}
