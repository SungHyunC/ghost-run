import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const wasmPath: string = require.resolve('sql.js/dist/sql-wasm.wasm');
const FIXED_SQL =
  'CREATE TABLE a(id INTEGER PRIMARY KEY, v INTEGER);' +
  'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 1206) INSERT INTO a(v) SELECT x FROM c;' +
  'CREATE TABLE b(k TEXT, n INTEGER);' +
  "INSERT INTO b VALUES ('one', 1), ('two', 2);";

async function load() {
  return initSqlJs({ locateFile: () => wasmPath });
}

describe('sql.js smoke (node)', () => {
  it('claim 1: initSqlJs loads the wasm file', async () => {
    const SQL = await load();
    const db = new SQL.Database();
    const res = db.exec('SELECT 1 AS one');
    expect(res[0]?.values[0]?.[0]).toBe(1);
    db.close();
  });

  it('claim 2: empty database export size', async () => {
    const SQL = await load();
    const db = new SQL.Database();
    const bytes = db.export();
    console.log('CLAIM2 empty export length =', bytes.length);
    expect(typeof bytes.length).toBe('number');
    db.close();
  });

  it('claim 3: same SQL twice exports equal bytes', async () => {
    const SQL = await load();
    const build = () => {
      const db = new SQL.Database();
      db.run(FIXED_SQL);
      const n = db.exec('SELECT count(*) FROM a')[0]?.values[0]?.[0];
      const out = db.export();
      db.close();
      return { n, out };
    };
    const one = build();
    const two = build();
    console.log('CLAIM3 rows =', one.n, 'export length =', one.out.length);
    expect(one.n).toBe(1206);
    expect(Buffer.from(one.out).equals(Buffer.from(two.out))).toBe(true);
  });

  it('claim 4: crypto.subtle.digest SHA-256 works', async () => {
    const d = await crypto.subtle.digest('SHA-256', new Uint8Array([1, 2, 3]));
    expect(d.byteLength).toBe(32);
  });

  it('claim 5: ArrayBuffer.isView and realm behaviour', () => {
    const made = new Uint8Array(4);
    const cloned = structuredClone(made);
    console.log(
      'CLAIM5 isView(made) =', ArrayBuffer.isView(made),
      'isView(cloned) =', ArrayBuffer.isView(cloned),
      'made instanceof Uint8Array =', made instanceof Uint8Array,
      'cloned instanceof Uint8Array =', cloned instanceof Uint8Array,
    );
    expect(ArrayBuffer.isView(made)).toBe(true);
    expect(ArrayBuffer.isView(cloned)).toBe(true);
  });

  it('claim 6: PRAGMA page_size and max_page_count', async () => {
    const SQL = await load();
    const db = new SQL.Database();
    const ps = db.exec('PRAGMA page_size')[0]?.values[0]?.[0];
    const mp0 = db.exec('PRAGMA max_page_count')[0]?.values[0]?.[0];
    const mp = db.exec('PRAGMA max_page_count = 64')[0]?.values[0]?.[0];
    let full = '';
    try {
      db.run('CREATE TABLE t(x BLOB)');
      for (let i = 0; i < 200; i++) db.run('INSERT INTO t VALUES (zeroblob(4096))');
    } catch (e) {
      full = String((e as Error).message);
    }
    console.log('CLAIM6 page_size =', ps, 'default max_page_count =', mp0, 'set =', mp, 'full error =', full);
    expect(ps).toBe(4096);
    expect(mp).toBe(64);
    expect(full.length).toBeGreaterThan(0);
    db.close();
  });
});
