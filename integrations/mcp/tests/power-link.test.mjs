// Test of the `power:link` helper (task 15.4): it writes only mcp.local.json, inside the power folder,
// with an absolute server path and no secret. Runs on a temp copy; nothing is written in the repository.
// **Validates: Requirements 20.4, 12.1**
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_POWER_DIR, linkPower } from '../scripts/power-link.mjs';

/**
 * @param {string} dir
 * @param {string} [base]
 * @returns {Promise<string[]>}
 */
async function listAll(dir, base = dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listAll(full, base)));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}

describe('power:link', () => {
  /** @type {string} */
  let tmp = '';
  /** @type {string} */
  let powerCopy = '';
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'ghost-power-link-'));
    powerCopy = path.join(tmp, 'power');
    await cp(DEFAULT_POWER_DIR, powerCopy, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('writes only mcp.local.json inside the power folder', async () => {
    const before = await listAll(powerCopy);
    const target = await linkPower(powerCopy);
    const after = await listAll(powerCopy);
    expect(path.dirname(target)).toBe(path.resolve(powerCopy));
    expect(after.filter((f) => !before.includes(f))).toEqual(['mcp.local.json']);
    expect(before.filter((f) => !after.includes(f))).toEqual([]);
  });

  it('holds the absolute server path, keeps the rest of mcp.json, and holds no secret', async () => {
    const target = await linkPower(powerCopy);
    const text = await readFile(target, 'utf8');
    const original = JSON.parse(await readFile(path.join(powerCopy, 'mcp.json'), 'utf8'));
    const local = JSON.parse(text);
    const expected = path.join(path.resolve(powerCopy), 'server', 'ghost-run-mcp.mjs');
    expect(local.mcpServers['ghost-run'].args).toEqual([expected]);
    expect(path.isAbsolute(expected)).toBe(true);
    expect({ ...local.mcpServers['ghost-run'], args: null }).toEqual({ ...original.mcpServers['ghost-run'], args: null });
    expect(local.mcpServers['ghost-run'].env).toEqual({});
    expect(text).not.toMatch(/sk-|secret|token|password|api[_-]?key/i);
  });
});
