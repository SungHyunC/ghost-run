import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** @param {string} path */
function isIgnored(path) {
  // git check-ignore reads only .gitignore rules; it creates no files.
  const r = spawnSync('git', ['check-ignore', '-q', '--no-index', '--', path], {
    cwd: repoRoot,
  });
  if (r.error) throw r.error;
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  throw new Error(`git check-ignore failed: ${String(r.stderr)}`);
}

describe('.gitignore entries', () => {
  const lines = readFileSync(resolve(repoRoot, '.gitignore'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim());

  it('lists .ghost-run/ and the local MCP config literally', () => {
    expect(lines).toContain('.ghost-run/');
    expect(lines).toContain('integrations/power/mcp.local.json');
  });

  it('effectively ignores .ghost-run/ contents', () => {
    expect(isIgnored('.ghost-run/store.json')).toBe(true);
  });

  it('effectively ignores integrations/power/mcp.local.json', () => {
    expect(isIgnored('integrations/power/mcp.local.json')).toBe(true);
  });

  it('does not ignore anything under .kiro/', () => {
    for (const p of ['.kiro/steering/a.md', '.kiro/specs/x/tasks.md', '.kiro/hooks/h.json']) {
      expect(isIgnored(p), p).toBe(false);
    }
  });
});
