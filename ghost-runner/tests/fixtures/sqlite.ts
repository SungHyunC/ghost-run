import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export type SqliteBackend = 'node:sqlite' | 'sqlite3-cli' | 'placeholder';

type NodeSqlite = {
  DatabaseSync: new (p: string) => { exec(sql: string): void; close(): void };
};

async function loadNodeSqlite(): Promise<NodeSqlite | undefined> {
  try {
    const spec = 'node:sqlite'; // absent on Node 20; resolved at runtime only
    return (await import(/* @vite-ignore */ spec)) as NodeSqlite;
  } catch {
    return undefined;
  }
}

export const sqlite3CliAvailable: boolean =
  spawnSync('sqlite3', ['-version'], { stdio: 'ignore' }).status === 0;

export function usersSql(rows: number): string {
  return (
    'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL);\n' +
    'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ' +
    String(rows) +
    ") INSERT INTO users (id, name, email) SELECT i, 'user' || i, 'user' || i || '@example.test' FROM n;\n"
  );
}

/**
 * Create `app.db` with a `users` table of `rows` rows.
 * Order: node:sqlite (Node >= 22.5), then the sqlite3 CLI, then a documented
 * fallback: a 4096-byte placeholder with the SQLite magic header (not a
 * queryable database). Callers must check the returned backend.
 */
export async function createUsersDb(path: string, rows = 1_206): Promise<SqliteBackend> {
  const mod = await loadNodeSqlite();
  if (mod !== undefined) {
    const db = new mod.DatabaseSync(path);
    db.exec(usersSql(rows));
    db.close();
    return 'node:sqlite';
  }
  if (sqlite3CliAvailable) {
    const r = spawnSync('sqlite3', [path], { input: usersSql(rows) });
    if (r.status === 0) return 'sqlite3-cli';
  }
  const buf = Buffer.alloc(4096);
  buf.write('SQLite format 3\0', 0, 'latin1');
  writeFileSync(path, buf);
  return 'placeholder';
}

/** Row count via the sqlite3 CLI, or undefined when unavailable. */
export function countUsers(path: string): number | undefined {
  if (!sqlite3CliAvailable) return undefined;
  const r = spawnSync('sqlite3', [path, 'SELECT count(*) FROM users;'], { encoding: 'utf8' });
  return r.status === 0 ? Number(r.stdout.trim()) : undefined;
}
