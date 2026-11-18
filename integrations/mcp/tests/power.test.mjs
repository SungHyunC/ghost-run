// Power folder tests (Requirement 20 criteria 2, 3, 4, 5, 7, 9). No network: schema URLs are compared, never fetched.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatReport } from '@ghost-run/core';
import { scanFiles } from '@ghost-run/core/possession-node';
import { buildBundle } from '../scripts/bundle.mjs';

const POWER_DIR = fileURLToPath(new URL('../../power/', import.meta.url));
const BUNDLE = path.join(POWER_DIR, 'server', 'ghost-run-mcp.mjs');

/** @param {string} rel */
async function readJson(rel) {
  return JSON.parse(await readFile(path.join(POWER_DIR, rel), 'utf8'));
}

/** All files under a folder, as POSIX paths relative to it. @param {string} dir @returns {Promise<string[]>} */
async function listFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) out.push(path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
  }
  return out.sort();
}

describe('power plugin.json (criterion 2)', () => {
  it('has the required fields', async () => {
    const plugin = await readJson('plugin.json');
    expect(plugin.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    expect(plugin.name).toBe('ghost-run');
    expect(plugin.name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/);
    expect(typeof plugin.description).toBe('string');
    expect(plugin.description.length).toBeGreaterThan(0);
    expect(Object.keys(plugin.author)).toEqual(['name']);
    expect(plugin.author.name).toBe('Ghost Run+ contributors');
    expect(Array.isArray(plugin.keywords)).toBe(true);
    for (const k of ['delete', 'drop table', 'migration', 'deploy', 'rm -rf', 'destructive', 'ghost run']) {
      expect(plugin.keywords).toContain(k);
    }
  });
});

describe('power SKILL.md (criterion 3)', () => {
  it('starts with a front matter holding name and description, and the body states the guidance', async () => {
    const text = await readFile(path.join(POWER_DIR, 'skills', 'ghost-run', 'SKILL.md'), 'utf8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
    expect(m).not.toBeNull();
    const front = /** @type {string} */ (m?.[1]);
    const body = /** @type {string} */ (m?.[2]);
    expect(front).toMatch(/^name: ghost-run\s*$/m);
    expect(front).toMatch(/^description: \S.*$/m);
    for (const word of ['wards_check', 'ghost_run', 'pass', 'warn', 'block', 'p1Claimed', 'p5Claimed', 'p6Claimed', 'advisory']) {
      expect(body).toContain(word);
    }
    expect(body).toMatch(/pass.{0,10}is not an approval/i);
    expect(body).toMatch(/warn[\s\S]{0,200}human/i);
  });
});

describe('power mcp.json (criterion 4)', () => {
  it('has the required fields and no secret-like env value', async () => {
    const mcp = await readJson('mcp.json');
    expect(mcp.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
    expect(Object.keys(mcp.mcpServers)).toEqual(['ghost-run']);
    const server = mcp.mcpServers['ghost-run'];
    expect(server.type).toBe('stdio');
    expect(typeof server.command).toBe('string');
    expect(server.command.length).toBeGreaterThan(0);
    expect(Array.isArray(server.args)).toBe(true);
    expect(server.args.every((/** @type {unknown} */ a) => typeof a === 'string')).toBe(true);
    expect(server.env !== null && typeof server.env === 'object' && !Array.isArray(server.env)).toBe(true);
    const secretLike = /(sk-|ghp_|xox[bap]-|AKIA|secret|token|passw|bearer|CANARY)/i;
    for (const [key, value] of Object.entries(server.env)) {
      expect(typeof value).toBe('string');
      expect(`${key}=${value}`).not.toMatch(secretLike);
      expect(/** @type {string} */ (value)).not.toMatch(/^[A-Za-z0-9+/_=-]{24,}$/);
    }
  });
});

describe('power folder contents (criteria 1, 5)', () => {
  it('holds the expected files and no hook or steering file', async () => {
    const files = await listFiles(POWER_DIR);
    for (const f of ['plugin.json', 'mcp.json', 'skills/ghost-run/SKILL.md', 'server/ghost-run-mcp.mjs']) {
      expect(files).toContain(f);
    }
    for (const f of files) {
      expect(f).not.toMatch(/(^|\/)(hooks?|steering)(\/|$)/i);
      expect(f).not.toMatch(/\.kiro\.hook$/);
      expect(f).not.toMatch(/(^|\/)\.kiro(\/|$)/);
    }
  });
});

describe('power bundle (task 15.3)', () => {
  it('is byte-equal to a fresh rebuild', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ghost-run-power-'));
    try {
      const out = await buildBundle(path.join(dir, 'ghost-run-mcp.mjs'));
      const [fresh, committed] = await Promise.all([readFile(out), readFile(BUNDLE)]);
      expect(fresh.length).toBe(committed.length);
      expect(fresh.equals(committed)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('power bundle hygiene (kiro-integration criterion 19.15)', () => {
  it('holds no absolute local path, home folder, or user name', async () => {
    const text = await readFile(BUNDLE, 'utf8');
    expect(text).not.toMatch(/\/Users\/[A-Za-z0-9._-]+\//);
    expect(text).not.toMatch(/\/home\/[A-Za-z0-9._-]+\//);
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    expect(text).not.toContain(repoRoot.replace(/\/$/, ''));
    const home = homedir();
    if (home.length > 3) expect(text).not.toContain(home);
    const user = userInfo().username;
    if (user.length >= 4) expect(text).not.toContain(user);
  });
});

describe('power possession scan (criterion 9)', () => {
  it('returns clean for every file in integrations/power/, bundle included', async () => {
    const files = await listFiles(POWER_DIR);
    const report = await scanFiles(files.map((f) => path.join(POWER_DIR, f)), { markdown: 'by-extension' });
    expect(report.files.length).toBe(files.length);
    expect(report.outcome, formatReport(report)).toBe('clean');
  });
});
