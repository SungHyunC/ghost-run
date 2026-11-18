import { beforeAll, describe, expect, it } from 'vitest';
import { InlineSqlExecutor, initInlineSql, screenSql } from '../src/index';
import type { SqlResponse } from '../src/index';

let sql: InlineSqlExecutor;
beforeAll(async () => {
  sql = await initInlineSql();
});

const run = (dbBytes: Uint8Array | null, text: string, outputLimit = 4096): Promise<SqlResponse> =>
  sql.run({ dbBytes, sql: text, outputLimit });

async function ok(dbBytes: Uint8Array | null, text: string, outputLimit?: number) {
  const r = await run(dbBytes, text, outputLimit);
  if (!r.ok) throw new Error(r.stderr);
  return r;
}

describe('handleSqlRequest via InlineSqlExecutor', () => {
  it('formats rows, NULL, and blobs like the sqlite3 shell', async () => {
    const r = await ok(null, "CREATE TABLE t(a, b, c); INSERT INTO t VALUES (1, NULL, x'0102'); SELECT * FROM t; SELECT 'x', 2.5;");
    expect(r.stdout).toBe('1||[blob 2 bytes]\nx|2.5\n');
  });

  it('cuts output at the limit', async () => {
    const r = await ok(null, 'SELECT 1; SELECT 2; SELECT 3;', 4);
    expect(r.stdout).toBe('1\n2\n');
  });

  it('reports table counts, excluding views and sqlite_ tables', async () => {
    const r = await ok(
      null,
      'CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT); INSERT INTO users DEFAULT VALUES; INSERT INTO users DEFAULT VALUES; CREATE TABLE orders(x); CREATE VIEW v AS SELECT * FROM users;',
    );
    expect(r.tables).toEqual({ orders: 0, users: 2 });
  });

  it('flags wrote only when a statement changed the file', async () => {
    const empty = await ok(null, 'SELECT 1;');
    expect(empty.wrote).toBe(false);
    const created = await ok(null, 'CREATE TABLE t(a);');
    expect(created.wrote).toBe(true);
    const again = await ok(created.dbBytes, 'SELECT * FROM t;');
    expect(again.wrote).toBe(false);
    expect(Array.from(again.dbBytes)).toEqual(Array.from(created.dbBytes));
    const inserted = await ok(created.dbBytes, 'INSERT INTO t VALUES (1);');
    expect(inserted.wrote).toBe(true);
  });

  it('returns Error: <message> for SQL errors', async () => {
    const r = await run(null, 'SELECT * FROM missing;');
    expect(r).toEqual({ ok: false, stderr: 'Error: no such table: missing' });
  });

  it('rejects a file that is not a database', async () => {
    const r = await run(new TextEncoder().encode('this is plainly not a sqlite database file at all'.repeat(20)), 'SELECT 1;');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.stderr).toContain('file is not a database');
  });

  it('is deterministic for equal input', async () => {
    const text = 'CREATE TABLE t(a); INSERT INTO t VALUES (1),(2);';
    const a = await ok(null, text);
    const b = await ok(null, text);
    expect(Array.from(a.dbBytes)).toEqual(Array.from(b.dbBytes));
    expect(a.tables).toEqual(b.tables);
  });

  it('stops a runaway insert at the 1 MiB page limit', async () => {
    const r = await run(null, 'CREATE TABLE t(x BLOB); WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n < 1000) INSERT INTO t SELECT zeroblob(4096) FROM c;');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.stderr).toMatch(/^Error: /);
  });
});

describe('screenSql', () => {
  const reasons: [string, string][] = [
    ['ATTACH DATABASE "x" AS y', 'ATTACH'],
    ['detach y', 'DETACH'],
    ['SELECT load_extension("x")', 'load_extension'],
    ['  .tables', 'dot-command'],
    ['VACUUM INTO "x"', 'VACUUM INTO'],
    ['PRAGMA max_page_count = 5', 'max_page_count'],
    ['SELECT random()', 'random'],
    ['SELECT randomblob(4)', 'randomblob'],
    ['SELECT current_time', 'current_time'],
    ['SELECT current_date', 'current_date'],
    ['SELECT current_timestamp', 'current_timestamp'],
    ['SELECT date(x)', 'date'],
    ['SELECT time(x)', 'time'],
    ['SELECT datetime(x)', 'datetime'],
    ['SELECT julianday(x)', 'julianday'],
    ['SELECT unixepoch(x)', 'unixepoch'],
    ['SELECT strftime(x)', 'strftime'],
    ["SELECT 'now'", "'now'"],
  ];
  const variants = (s: string) => [s.toLowerCase(), s.toUpperCase(), s.replace(/[a-z]/g, (c, i: number) => (i % 2 ? c.toUpperCase() : c))];

  for (const [text, reason] of reasons) {
    it(`flags ${reason} in lower, upper, and mixed case`, () => {
      for (const v of variants(text)) expect(screenSql(v)).toBe(reason);
    });
  }

  it('ignores words inside literals and comments, and allows plain SQL', () => {
    expect(screenSql("SELECT 'random', 'attach' -- date\n FROM t /* datetime */")).toBeNull();
    expect(screenSql('INSERT INTO t VALUES (1); VACUUM;')).toBeNull();
    expect(screenSql('-- note\nSELECT 1')).toBeNull();
  });

  it('does not flag a dot inside the text', () => {
    expect(screenSql('SELECT 1.5')).toBeNull();
  });
});
