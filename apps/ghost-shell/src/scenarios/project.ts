// Deterministic project fixture: no clock, no random, fixed text.
import type { SqlExecutor, VirtualProject } from '@ghost-run/playground-shell';
import { buildReadme } from './readme';

const DB_SQL = [
  'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, deleted_at INTEGER);',
  'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1206)',
  "  INSERT INTO users (id, name, email, deleted_at) SELECT i, 'user' || i, 'user' || i || '@example.test', NULL FROM n;",
  'CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, total_cents INTEGER NOT NULL);',
  'INSERT INTO orders (id, user_id, total_cents) VALUES (1, 1, 1250), (2, 2, 990), (3, 3, 4300);',
].join('\n');

const encoder = new TextEncoder();
type Entries = VirtualProject['entries'];
type Entry = Entries[string];

function file(text: string): Entry {
  return { kind: 'file', bytes: encoder.encode(text) };
}

export async function buildProject(sql: SqlExecutor): Promise<VirtualProject> {
  const res = await sql.run({ dbBytes: null, sql: DB_SQL, outputLimit: 1000 });
  if (!res.ok) throw new Error(`fixture database failed: ${res.stderr}`);
  const entries: Record<string, Entry> = {
    'package.json': file(
      '{"name":"playground-demo","version":"1.0.0","scripts":{"clean":"rm -rf data","test":"echo \\"all tests passed\\""}}\n',
    ),
    data: { kind: 'dir' },
    'data/.keep': file(''),
    'data/a.csv': file('id,name\n1,alpha\n2,beta\n'),
    'data/b.csv': file('id,name\n3,gamma\n4,delta\n'),
    'data/sub': { kind: 'dir' },
    'data/sub/c.json': file('[{"id":1,"name":"alpha"}]\n'),
    'data/sub/d.json': file('[{"id":2,"name":"beta"}]\n'),
    build: { kind: 'dir' },
    'build/out.js': file('console.log("fake bundle");\n'),
    'app.db': { kind: 'file', bytes: res.dbBytes, tables: { orders: 3, users: 1206 } },
    '.env': file('API_KEY=sk-CANARY-abc123\n'),
    'README.md': file(buildReadme()),
  };
  return { name: 'playground-demo', entries };
}
