import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsersDb, type SqliteBackend } from './sqlite.js';

export const CANARY = 'sk-CANARY-abc123';
export const USERS_ROWS = 1_206;

export interface FixtureRepo {
  readonly root: string;
  readonly sqlite: SqliteBackend;
  /** Relative paths of regular files created (at most 50). */
  readonly files: readonly string[];
  cleanup(): void;
}

/**
 * Create a fixture repository under the OS temp dir:
 * `.env` (canary), `app.db` (users x 1,206), `data/`, `build/`, `package.json`
 * (`test` = `node --test`, `clean` = `rm -rf data`), a few sources. No
 * node_modules. Total regular files stay well under 50.
 */
export async function createFixtureRepo(): Promise<FixtureRepo> {
  const root = mkdtempSync(join(tmpdir(), 'ghost-fixture-'));
  const files: string[] = [];
  const put = (rel: string, content: string): void => {
    writeFileSync(join(root, rel), content);
    files.push(rel);
  };
  mkdirSync(join(root, 'data'));
  mkdirSync(join(root, 'build'));
  mkdirSync(join(root, 'src'));
  put('.env', `API_KEY=${CANARY}\n`);
  put(
    'package.json',
    JSON.stringify(
      { name: 'fixture', version: '0.0.0', scripts: { test: 'node --test', clean: 'rm -rf data' } },
      null,
      2,
    ) + '\n',
  );
  put('README.md', '# fixture\n');
  put('src/index.js', 'console.log("hello");\n');
  put('data/seed.txt', 'seed\n');
  put('build/out.js', '// build output\n');
  const sqlite = await createUsersDb(join(root, 'app.db'), USERS_ROWS);
  files.push('app.db');
  return {
    root,
    sqlite,
    files,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
