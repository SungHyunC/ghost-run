// Process-level bootstrap failure tests for ghost-gate.mjs (task 8.8). Each case spawns
// `node ghost-gate.mjs` from a temporary copy of the package, so the real sources are never changed.
// No case reaches the runner, so no container is started. The short watchdog comes from a modified
// copy of gate-config.mjs (no environment variable can shorten it).
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FATAL_LINES } from '../lib/hook-io.mjs';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANARY = 'sk-CANARY-bootstrap-8x8';

/** @type {string[]} */
const dirs = [];

afterEach(async () => {
  while (dirs.length > 0) {
    const d = dirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

/** @returns {Promise<string>} */
async function tmp() {
  const d = await mkdtemp(join(tmpdir(), 'ghost-bootstrap-'));
  dirs.push(d);
  return d;
}

/**
 * Copy the bootstrap, the constants and lib/ into a temp package. node_modules links to the real one.
 * @param {{ ghostRunnerStub?: boolean }} [opts]
 * @returns {Promise<string>} the temp package folder
 */
async function makeCopy(opts = {}) {
  const root = await tmp();
  const pkg = join(root, 'pkg');
  await mkdir(pkg);
  for (const f of ['ghost-gate.mjs', 'gate-config.mjs', 'package.json']) {
    await cp(join(PKG, f), join(pkg, f));
  }
  await cp(join(PKG, 'lib'), join(pkg, 'lib'), { recursive: true });
  if (opts.ghostRunnerStub) {
    // A real node_modules tree in which ghost-runner has no dist/ (the renamed-dist case).
    const scope = join(pkg, 'node_modules', '@ghost-run');
    await mkdir(scope, { recursive: true });
    for (const name of await readdir(join(PKG, 'node_modules', '@ghost-run'))) {
      if (name !== 'ghost-runner') {
        await symlink(join(PKG, 'node_modules', '@ghost-run', name), join(scope, name), 'dir');
      }
    }
    const stub = join(scope, 'ghost-runner');
    await mkdir(stub);
    await cp(join(PKG, '..', '..', 'ghost-runner', 'package.json'), join(stub, 'package.json'));
  } else {
    await symlink(join(PKG, 'node_modules'), join(pkg, 'node_modules'), 'dir');
  }
  return pkg;
}

/**
 * @param {string} pkg
 * @param {string | Buffer} stdin
 * @param {Record<string, string>} [env]
 * @param {string} [cwd]
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
function runGate(pkg, stdin, env = {}, cwd = pkg) {
  return new Promise((resolve, reject) => {
    const clean = { ...process.env };
    delete clean['GHOST_RUN_WARDS_FILE'];
    delete clean['GHOST_RUN_SEANCE_BASE'];
    const child = spawn(process.execPath, [join(pkg, 'ghost-gate.mjs')], {
      cwd,
      env: { ...clean, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.on('error', () => {});
    child.on('error', reject);
    const guard = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('close', (code) => {
      clearTimeout(guard);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}

/** @param {string} cwd @param {string} command */
const event = (cwd, command) =>
  JSON.stringify({
    hook_event_name: 'PreToolUse',
    cwd,
    session_id: 'bootstrap-session',
    tool_name: 'execute_bash',
    tool_input: { command },
  });

const INPUT_TEXT = `echo ${CANARY}`;

/** Assert the output holds exactly the fixed line and none of the input text. */
/**
 * @param {{ code: number|null, stdout: string, stderr: string }} r
 * @param {keyof typeof FATAL_LINES} kind
 */
function expectFixed(r, kind) {
  expect(r.code).toBe(2);
  expect(r.stdout).toBe('');
  expect(r.stderr).toBe(`${FATAL_LINES[kind]}\n`);
  expect(r.stdout + r.stderr).not.toContain(CANARY);
  expect(r.stderr).not.toMatch(/\bat .*:\d+:\d+|node:internal|Error:/);
}

/** A main.mjs double whose run never settles. */
const HANGING_RUN = 'export const run = () => new Promise(() => {});\n';

describe('ghost-gate bootstrap failures (process level)', () => {
  it('missing ghost-runner dist/ gives exit 2 and the GATE UNAVAILABLE line', async () => {
    const pkg = await makeCopy({ ghostRunnerStub: true });
    const r = await runGate(pkg, event(pkg, INPUT_TEXT));
    expectFixed(r, 'unavailable');
    expect(r.stderr).toContain('GATE UNAVAILABLE');
  });

  it('a syntax error in a copy of main.mjs gives exit 2 (unavailable)', async () => {
    const pkg = await makeCopy();
    await writeFile(join(pkg, 'lib', 'gate', 'main.mjs'), `export const run = (;\n// ${CANARY}\n`);
    const r = await runGate(pkg, event(pkg, INPUT_TEXT));
    expectFixed(r, 'unavailable');
  });

  it('an uncaught throw gives exit 2 with the internal-error line and no stack', async () => {
    const pkg = await makeCopy();
    await writeFile(
      join(pkg, 'lib', 'gate', 'main.mjs'),
      `setTimeout(() => { throw new Error('${CANARY}'); }, 0);\n${HANGING_RUN}`,
    );
    const r = await runGate(pkg, event(pkg, INPUT_TEXT));
    expectFixed(r, 'internal-error');
  });

  it('an unhandled rejection gives exit 2 with the internal-error line and no stack', async () => {
    const pkg = await makeCopy();
    await writeFile(
      join(pkg, 'lib', 'gate', 'main.mjs'),
      `setTimeout(() => { Promise.reject(new Error('${CANARY}')); }, 0);\n${HANGING_RUN}`,
    );
    const r = await runGate(pkg, event(pkg, INPUT_TEXT));
    expectFixed(r, 'internal-error');
  });

  it('a throwing run gives exit 2 with the internal-error line', async () => {
    const pkg = await makeCopy();
    await writeFile(
      join(pkg, 'lib', 'gate', 'main.mjs'),
      `export const run = async () => { throw new Error('${CANARY}'); };\n`,
    );
    expectFixed(await runGate(pkg, event(pkg, INPUT_TEXT)), 'internal-error');
  });

  it('a hanging runner double with a short watchdog gives exit 2, the timeout line, and runs cleanup', async () => {
    const pkg = await makeCopy();
    const marker = join(pkg, 'cleanup-called.txt');
    const cfgPath = join(pkg, 'gate-config.mjs');
    const cfg = await readFile(cfgPath, 'utf8');
    const short = cfg.replace('WATCHDOG_MS = 50_000', 'WATCHDOG_MS = 700');
    expect(short).not.toBe(cfg);
    await writeFile(cfgPath, short);
    await writeFile(
      join(pkg, 'lib', 'gate', 'main.mjs'),
      `import { writeFileSync } from 'node:fs';\n${HANGING_RUN}` +
        `export const cleanupOnTimeout = async () => { writeFileSync(${JSON.stringify(marker)}, 'x'); };\n`,
    );
    const started = Date.now();
    const r = await runGate(pkg, event(pkg, INPUT_TEXT));
    expectFixed(r, 'timeout');
    expect(r.stderr).toContain('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(await readFile(marker, 'utf8')).toBe('x');
  });

  it('a missing Wards_File gives exit 2 before any runner is reached', async () => {
    const pkg = await makeCopy();
    const ws = await tmp();
    const r = await runGate(
      pkg,
      event(ws, INPUT_TEXT),
      { GHOST_RUN_WARDS_FILE: join(ws, 'does-not-exist.yaml') },
      ws,
    );
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).not.toBe('');
    expect(r.stdout + r.stderr).not.toContain(CANARY);
  });

  it('STDIN over 1 MiB gives exit 2 with the internal-error line', async () => {
    const pkg = await makeCopy();
    const big = Buffer.alloc(1_048_576 + 1, 0x61);
    big.write(CANARY, 0);
    expectFixed(await runGate(pkg, big), 'internal-error');
  });

  it('invalid STDIN (not JSON) gives exit 2 and echoes nothing', async () => {
    const pkg = await makeCopy();
    const ws = await tmp();
    const r = await runGate(pkg, `not json ${CANARY}`, {}, ws);
    expect(r.code).toBe(2);
    expect(r.stdout + r.stderr).not.toContain(CANARY);
  });

  it('only the exit codes 0 and 2 occur across the failure cases', async () => {
    const pkg = await makeCopy({ ghostRunnerStub: true });
    const codes = new Set();
    for (const input of ['', '{', event(pkg, INPUT_TEXT), `[${CANARY}]`]) {
      codes.add((await runGate(pkg, input)).code);
    }
    expect([...codes].every((c) => c === 0 || c === 2)).toBe(true);
  });
});
