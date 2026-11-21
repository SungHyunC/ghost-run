// The root vitest.worlds.config.ts must load in a clean checkout, where the root has no node_modules.
// It may therefore import only `node:` modules; `vitest/config` resolves only from a package folder.
// The documented command is `pnpm --filter @ghost-run/kiro-hook exec vitest --run --config ../../vitest.worlds.config.ts`.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PKG = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const CONFIG = path.resolve(PKG, '..', '..', 'vitest.worlds.config.ts');
const require = createRequire(import.meta.url);

/** @param {string} source @returns {string[]} */
function importSpecifiers(source) {
  const out = [];
  for (const m of source.matchAll(/\b(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)) out.push(String(m[1]));
  return out;
}

describe('vitest.worlds.config.ts', () => {
  it('imports only node: modules, so it loads without a root node_modules', async () => {
    const specs = importSpecifiers(await readFile(CONFIG, 'utf8'));
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.filter((s) => !s.startsWith('node:'))).toEqual([]);
  });

  it('the checker flags a bare package import', () => {
    expect(importSpecifiers("import { defineConfig } from 'vitest/config';")).toEqual(['vitest/config']);
    expect(importSpecifiers("const x = require('vitest/config');")).toEqual(['vitest/config']);
  });

  it('the documented command loads the config and finds no test for an unmatched filter', { timeout: 60_000 }, () => {
    const vitestBin = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
    const r = spawnSync(
      process.execPath,
      [vitestBin, '--run', '--config', '../../vitest.worlds.config.ts', 'no-such-world-test-filter'],
      { cwd: PKG, encoding: 'utf8', timeout: 50_000 },
    );
    expect(r.stderr + r.stdout).not.toMatch(/failed to load config|ERR_MODULE_NOT_FOUND/);
    expect(r.status).toBe(0);
  });
});
