// The power ships the box sources (kiro-integration Requirement 19, criterion 13): integrations/power/box
// equals ghost-runner/box byte for byte, and the bundle's own folder finds it. No Docker needed.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findBoxDir } from '@ghost-run/ghost-runner';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE = path.join(REPO, 'ghost-runner', 'box');
const POWER = path.join(REPO, 'integrations', 'power');

/** @param {string} dir @returns {Promise<string[]>} */
async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile() && !e.name.endsWith('.local')) out.push(path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
  }
  return out.sort();
}

describe('power box sources', () => {
  it('equal ghost-runner/box byte for byte (run `corepack pnpm --filter @ghost-run/mcp bundle` after a box change)', async () => {
    const source = await files(SOURCE);
    expect(source).toContain('Dockerfile');
    expect(source).toContain('BASE_DIGEST');
    expect(source).toContain('build.mjs');
    expect(source.some((f) => f.startsWith('recorder/'))).toBe(true);
    expect(await files(path.join(POWER, 'box'))).toEqual(source);
    for (const f of source) {
      const [a, b] = await Promise.all([readFile(path.join(SOURCE, f)), readFile(path.join(POWER, 'box', f))]);
      expect(b.equals(a), f).toBe(true);
    }
  });

  it('are found from the folder of the bundle, with no environment value and no workspace', () => {
    const found = findBoxDir({ env: {}, moduleDir: path.join(POWER, 'server') });
    expect(found).toBe(path.join(POWER, 'box'));
  });
});
