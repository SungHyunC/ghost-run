// Docker Desktop Resource Saver: the gate retries a timed-out availability check once with the longer
// deadline before it falls back to static analysis. Uses the real runner with an injected Docker client.
// The full-run case is [docker]: skipped (never passed) when Docker or the box image is missing.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlan as realRunPlan } from '@ghost-run/ghost-runner';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOCKER_WAKE_RETRY_MS, RUNNER_DEADLINE_SEC, WATCHDOG_MS } from '../gate-config.mjs';
import { judgeShell } from '../lib/gate/shell-judgment.mjs';

/** @type {string} */
let base;
/** @type {string} */
let root;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'gate-wake-'));
  root = join(base, 'ws');
  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(join(root, 'data', 'a.txt'), 'a\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const TIMED_OUT = { code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: true };

/**
 * Real Docker for every call except the replaced first `image inspect` (see `sleepingClient`).
 * @param {readonly string[]} args @param {{ timeoutMs?: number }} [o]
 * @returns {Promise<any>}
 */
function realDocker(args, o = {}) {
  return new Promise((resolve) => {
    const child = spawn('docker', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    /** @type {Buffer[]} */
    const out = [];
    /** @type {Buffer[]} */
    const err = [];
    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, o.timeoutMs ?? 60_000);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => {
      clearTimeout(t);
      resolve({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: false, spawnError: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err), timedOut });
    });
  });
}

/**
 * @param {(args: readonly string[], o: any) => Promise<any>} inner
 * @param {number} sleepingChecks how many `image inspect` calls time out first
 */
function sleepingClient(inner, sleepingChecks) {
  /** @type {number[]} */
  const inspectDeadlines = [];
  let slept = 0;
  return {
    inspectDeadlines,
    client: {
      async run(/** @type {readonly string[]} */ args, /** @type {any} */ o) {
        if (args[0] === 'image' && args[1] === 'inspect') {
          inspectDeadlines.push(o?.timeoutMs);
          if (slept < sleepingChecks) {
            slept += 1;
            return TIMED_OUT;
          }
        }
        return inner(args, o);
      },
    },
  };
}

/** @param {any} client */
function judge(client) {
  /** @type {any[]} */
  const seen = [];
  const runPlan = /** @type {typeof realRunPlan} */ (
    (plan, opts) => {
      seen.push(opts);
      return realRunPlan(plan, { ...opts, client });
    }
  );
  return {
    seen,
    run: async () =>
      /** @type {any} */ (await judgeShell(
        {
          root,
          toolInput: { command: 'rm -rf data' },
          wardSet: { wards: [] },
          elapsedSec: 0,
          semaphore: { dir: join(base, 'locks') },
        },
        { runPlan },
      )),
  };
}

const unreachable = async () => ({ code: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('Cannot connect to the Docker daemon'), timedOut: false });

describe('gate-config wake constants', () => {
  it('keeps the wake retry inside the runner deadline and the watchdog', () => {
    expect(DOCKER_WAKE_RETRY_MS).toBe(10_000);
    expect(2_000 + DOCKER_WAKE_RETRY_MS).toBeLessThan(RUNNER_DEADLINE_SEC * 1000);
    expect(RUNNER_DEADLINE_SEC * 1000).toBeLessThan(WATCHDOG_MS);
  });
});

describe('judgeShell with a sleeping Docker', () => {
  it('passes the wake retry deadline to the runner', async () => {
    const c = sleepingClient(unreachable, 0);
    const j = judge(c.client);
    await j.run();
    expect(j.seen[0]?.dockerWakeRetryMs).toBe(DOCKER_WAKE_RETRY_MS);
  });

  it('unavailable (daemon down): static analysis, no retry', async () => {
    const c = sleepingClient(unreachable, 0);
    const r = await judge(c.client).run();
    expect(r).toMatchObject({ decision: 'judged', rehearsed: false });
    expect(r.result?.isolation.mode).toBe('static-analysis');
    expect(r.result?.dockerWakeRetried).toBe(false);
    expect(c.inspectDeadlines).toEqual([2000]);
  });

  it('timeout past both deadlines: static analysis, the retry is recorded', async () => {
    const c = sleepingClient(unreachable, 2);
    const r = await judge(c.client).run();
    expect(r).toMatchObject({ decision: 'judged', rehearsed: false });
    expect(r.result?.isolation).toMatchObject({ mode: 'static-analysis', reason: 'docker-unavailable' });
    expect(r.result?.dockerWakeRetried).toBe(true);
    expect(r.result?.phases.dockerCheckMs).toBeGreaterThanOrEqual(0);
    expect(c.inspectDeadlines).toEqual([2000, DOCKER_WAKE_RETRY_MS]);
    expect(r.verdict).not.toBe('pass');
  });
});

function dockerReady() {
  const v = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', timeout: 20_000 });
  if (v.error !== undefined || v.status !== 0) return false;
  const imgs = spawnSync('docker', ['image', 'ls', '-q', 'ghost-run/box'], { encoding: 'utf8', timeout: 20_000 });
  return imgs.status === 0 && imgs.stdout.trim() !== '';
}
const ready = dockerReady();
if (!ready) console.info('gate wake docker test: skipped (docker unavailable)');

describe.skipIf(!ready)('[docker] slow first check, fast retry', () => {
  it('runs the full rehearsal after the wake retry', { timeout: 120_000 }, async () => {
    const c = sleepingClient(realDocker, 1);
    const r = await judge(c.client).run();
    expect(r).toMatchObject({ decision: 'judged', rehearsed: true });
    expect(r.result?.isolation.mode).toBe('docker-box');
    expect(r.result?.dockerWakeRetried).toBe(true);
    expect(c.inspectDeadlines).toEqual([2000, DOCKER_WAKE_RETRY_MS]);
    expect(r.result?.phases.dockerCheckMs).toBeGreaterThanOrEqual(0);
  });
});
