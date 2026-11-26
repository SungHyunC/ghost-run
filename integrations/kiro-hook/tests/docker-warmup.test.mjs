// The warm-up hook (Docker Desktop Resource Saver): never blocks, prints nothing, exits 0, and starts
// one detached `docker` call. A fake `docker` executable on PATH stands in for the real one.
import { spawn, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WARMUP_BUDGET_MS } from '../gate-config.mjs';
import { shippedText } from './shipped-file.mjs';
import { THROTTLE_MS, WARMUP_ARGS, warmUp } from '../lib/warmup.mjs';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = join(PKG, 'docker-warmup.mjs');

/** @type {string} */
let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'warmup-'));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

/** @param {number} sleepSec @returns {Promise<string>} PATH folder holding a fake docker */
async function fakeDockerBin(sleepSec) {
  const bin = join(base, 'bin');
  await mkdir(bin, { recursive: true });
  const script = `#!/bin/sh\necho "$$ $*" >> "${base}/started.log"\nsleep ${sleepSec}\necho done >> "${base}/done.log"\n`;
  await writeFile(join(bin, 'docker'), script);
  await chmod(join(bin, 'docker'), 0o755);
  return bin;
}

/** @param {() => boolean} ok @param {number} ms */
async function until(ok, ms) {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  return ok();
}

/** @param {string} bin @returns {Promise<{ code: number | null, stdout: string, stderr: string, ms: number }>} */
function runHook(bin) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [HOOK], {
      cwd: base,
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, TMPDIR: base },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr, ms: Date.now() - t0 }));
    // Stdin stays open and silent: the hook must not wait for it.
  });
}

describe('docker-warmup hook process', () => {
  it('exits 0 within its budget, prints nothing, and leaves a detached docker call running', async () => {
    const bin = await fakeDockerBin(2);
    const r = await runHook(bin);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
    expect(r.ms).toBeLessThan(WARMUP_BUDGET_MS);
    // The fake docker was started, and it is still sleeping when the hook has already exited.
    expect(await until(() => existsSync(join(base, 'started.log')), 3000)).toBe(true);
    expect(existsSync(join(base, 'done.log'))).toBe(false);
    // It survives the parent and finishes on its own.
    expect(await until(() => existsSync(join(base, 'done.log')), 6000)).toBe(true);
    expect((await readFile(join(base, 'started.log'), 'utf8')).trim()).toMatch(/^\d+ info --format/);
  });

  it('a second run inside the throttle window starts no second process', async () => {
    const bin = await fakeDockerBin(0);
    expect((await runHook(bin)).code).toBe(0);
    expect(await until(() => existsSync(join(base, 'done.log')), 3000)).toBe(true);
    expect((await runHook(bin)).code).toBe(0);
    await new Promise((r) => setTimeout(r, 300));
    expect((await readFile(join(base, 'started.log'), 'utf8')).trim().split('\n')).toHaveLength(1);
  });

  it('exits 0 and prints nothing when docker is not installed', async () => {
    const empty = join(base, 'empty');
    await mkdir(empty);
    const r = await runHook(empty);
    expect(r).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(r.ms).toBeLessThan(WARMUP_BUDGET_MS);
  });

  it('does not use a shell and has no network or LLM code', async () => {
    const src = (await readFile(HOOK, 'utf8')) + (await readFile(join(PKG, 'lib', 'warmup.mjs'), 'utf8'));
    expect(src).not.toMatch(/\bexec(Sync)?\(|shell:\s*true|fetch\(|node:https?|node:net/);
  });
});

describe('warmUp', () => {
  /** @param {{ throwOnSpawn?: boolean }} [o] */
  function fakeSpawn(o = {}) {
    /** @type {{ file: string, args: string[], opts: any, unref: number }[]} */
    const calls = [];
    const fn = /** @type {any} */ (
      (/** @type {string} */ file, /** @type {string[]} */ args, /** @type {any} */ opts) => {
        if (o.throwOnSpawn) throw new Error('spawn failed');
        const rec = { file, args, opts, unref: 0 };
        calls.push(rec);
        return { on: () => {}, unref: () => void (rec.unref += 1) };
      }
    );
    return { fn, calls };
  }

  it('starts one detached docker call with ignored stdio and unrefs it', () => {
    const s = fakeSpawn();
    expect(warmUp(base, { spawn: s.fn, tmp: base, now: () => 1_000_000 })).toBe(true);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]).toMatchObject({ file: 'docker', args: [...WARMUP_ARGS], unref: 1 });
    expect(s.calls[0]?.opts).toMatchObject({ detached: true, stdio: 'ignore', shell: false });
  });

  it('is throttled for THROTTLE_MS and runs again after it', () => {
    const s = fakeSpawn();
    const at = 5_000_000;
    expect(warmUp(base, { spawn: s.fn, tmp: base, now: () => at })).toBe(true);
    expect(warmUp(base, { spawn: s.fn, tmp: base, now: () => at + THROTTLE_MS - 1 })).toBe(false);
    expect(warmUp(base, { spawn: s.fn, tmp: base, now: () => at + THROTTLE_MS + 1 })).toBe(true);
    expect(s.calls).toHaveLength(2);
  });

  it('never throws', () => {
    const s = fakeSpawn({ throwOnSpawn: true });
    expect(() => warmUp(base, { spawn: s.fn, tmp: base })).not.toThrow();
    expect(warmUp(base, { spawn: s.fn, tmp: '/proc/does/not/exist/\0bad' })).toBe(false);
  });
});

describe('docker-warmup hook entry', () => {
  it('is committed disabled with a short timeout', async () => {
    const repo = join(PKG, '..', '..');
    // The committed version: a working tree with `gate:on` run has the file enabled on disk.
    const doc = JSON.parse(shippedText(repo, '.kiro/hooks/docker-warmup.json'));
    expect(doc.hooks).toHaveLength(1);
    expect(doc.hooks[0]).toMatchObject({ trigger: 'PreToolUse', matcher: 'shell', enabled: false });
    expect(doc.hooks[0].timeout).toBeLessThanOrEqual(10);
    expect(doc.hooks[0].action.command).toBe('node integrations/kiro-hook/docker-warmup.mjs');
    expect(spawnSync(process.execPath, ['--check', HOOK]).status).toBe(0);
  });
});
