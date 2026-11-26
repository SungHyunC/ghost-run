// The committed gate bundle in integrations/power/gate (kiro-integration Requirement 29): a fresh build is
// byte-identical, it needs no workspace package, and the bootstrap fails closed when the real gate is missing.
// No case reaches the runner, so no container is started.
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FATAL_LINES } from '../lib/hook-io.mjs';
import { GATE_FILES, buildGate } from '../scripts/bundle-gate.mjs';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMITTED = join(PKG, '..', 'power', 'gate');

/** @type {string[]} */
const dirs = [];
afterEach(async () => {
  while (dirs.length > 0) await rm(String(dirs.pop()), { recursive: true, force: true });
});

async function tmp() {
  const d = await mkdtemp(join(tmpdir(), 'ghost-gate-bundle-'));
  dirs.push(d);
  return d;
}

/**
 * @param {string} gateFile
 * @param {string} cwd
 * @param {string} stdin
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
function runNode(gateFile, cwd, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [gateFile], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.on('error', () => {});
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

describe('gate bundle', () => {
  it('lists the four files and commits exactly those', async () => {
    expect([...GATE_FILES].sort()).toEqual(['docker-warmup.mjs', 'gate-main.mjs', 'ghost-gate.mjs', 'seance.mjs']);
    expect((await readdir(COMMITTED)).sort()).toEqual([...GATE_FILES].sort());
  });

  it('a fresh build is byte-identical to the committed files', async () => {
    const out = await tmp();
    await buildGate(out);
    for (const name of GATE_FILES) {
      const fresh = await readFile(join(out, name));
      const committed = await readFile(join(COMMITTED, name));
      expect(fresh.equals(committed), `${name} is stale; run: corepack pnpm --filter @ghost-run/kiro-hook bundle`).toBe(true);
    }
  }, 60_000);

  it('holds only ASCII and imports no workspace package or node_modules path', async () => {
    for (const name of GATE_FILES) {
      const text = await readFile(join(COMMITTED, name), 'utf8');
      expect(/[^\x00-\x7F]/.test(text), `${name} has non-ASCII text`).toBe(false);
      expect(text, name).not.toMatch(/from\s+["']@ghost-run\//);
      expect(text, name).not.toMatch(/import\(\s*["']@ghost-run\//);
    }
  });

  it('the bootstrap loads the real gate with a dynamic import of its neighbour', async () => {
    const text = await readFile(join(COMMITTED, 'ghost-gate.mjs'), 'utf8');
    expect(text).toMatch(/await import\("\.\/gate-main\.mjs"\)/);
    expect(text).not.toMatch(/^import .* from "\.\/gate-main\.mjs"/m);
  });

  it('fails closed: without gate-main.mjs the bootstrap prints the fixed line and exits 2', async () => {
    const dir = await tmp();
    await cp(join(COMMITTED, 'ghost-gate.mjs'), join(dir, 'ghost-gate.mjs'));
    const event = JSON.stringify({ hook_event_name: 'PreToolUse', cwd: dir, tool_name: 'execute_bash', tool_input: { command: 'ls' } });
    const r = await runNode(join(dir, 'ghost-gate.mjs'), dir, event);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(`${FATAL_LINES.unavailable}\n`);
  });

  it('fails closed: a gate-main.mjs with a syntax error also exits 2', async () => {
    const dir = await tmp();
    await cp(join(COMMITTED, 'ghost-gate.mjs'), join(dir, 'ghost-gate.mjs'));
    await writeFile(join(dir, 'gate-main.mjs'), 'export const run = (;\n');
    const event = JSON.stringify({ hook_event_name: 'PreToolUse', cwd: dir, tool_name: 'execute_bash', tool_input: { command: 'ls' } });
    const r = await runNode(join(dir, 'ghost-gate.mjs'), dir, event);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe(`${FATAL_LINES.unavailable}\n`);
  });

  it('fails closed on a broken event even with the real gate present', async () => {
    const dir = await tmp();
    for (const name of GATE_FILES) await cp(join(COMMITTED, name), join(dir, name));
    const r = await runNode(join(dir, 'ghost-gate.mjs'), dir, 'not json');
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
  });

  it('the viewer bundle is the neighbour that the seance auto-start looks for', async () => {
    const text = await readFile(join(COMMITTED, 'gate-main.mjs'), 'utf8');
    expect(text).toContain('new URL("./seance.mjs", import.meta.url)');
  });
});
