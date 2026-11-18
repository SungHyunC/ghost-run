import { execFileSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireSlot, BUSY_LINE, withSlot } from '../lib/gate/semaphore.mjs';
import { armGateWatchdog, armWatchdog, cleanupRun, runnerBudgetSec, TIMEOUT_LINE } from '../lib/gate/watchdog.mjs';

/** @type {string} */
let dir;
beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gate-sem-'));
});
afterEach(async () => {
  vi.useRealTimers();
  await fsp.rm(dir, { recursive: true, force: true });
});

describe('runnerBudgetSec', () => {
  it('is min(44, floor(48 - elapsed)) and never below 5', () => {
    expect(runnerBudgetSec(0)).toBe(44);
    expect(runnerBudgetSec(10.5)).toBe(37);
    expect(runnerBudgetSec(47)).toBe(5);
    expect(runnerBudgetSec(100)).toBe(5);
  });
});

describe('watchdog', () => {
  it('fires at 50 s with a hanging runner double: cleanup gets the run id, prints the line, exits 2', async () => {
    vi.useFakeTimers();
    const cleanup = vi.fn(async () => {});
    const print = vi.fn();
    const exit = vi.fn();
    armGateWatchdog({ runId: 'run-abc_1', cleanup, print, exit, supportsRunId: true });
    const hang = new Promise(() => {}); // the runner double never returns
    void hang;
    await vi.advanceTimersByTimeAsync(49_999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(cleanup).toHaveBeenCalledWith('run-abc_1');
    expect(print).toHaveBeenCalledWith(TIMEOUT_LINE);
    expect(exit).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('still exits 2 when cleanup throws', async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    armWatchdog({ ms: 10, onFire: () => Promise.reject(new Error('x')), print: () => {}, exit });
    await vi.advanceTimersByTimeAsync(10);
    expect(exit).toHaveBeenCalledWith(2);
  });

  it('a disarmed watchdog never fires', async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    const cleanup = vi.fn(async () => {});
    const w = armGateWatchdog({ runId: 'r1', cleanup, print: () => {}, exit, supportsRunId: true });
    w.disarm();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(exit).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('cleanupRun ignores a run id that does not match the pattern', async () => {
    const runCommand = vi.fn(async () => '');
    await cleanupRun('../etc', { tmpdir: dir, runCommand });
    await cleanupRun('a b', { tmpdir: dir, runCommand });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('cleanupRun uses argument arrays and removes the run temp folder', async () => {
    const target = path.join(dir, 'ghost-run', 'run-1');
    await fsp.mkdir(target, { recursive: true });
    await fsp.writeFile(path.join(target, 'f'), 'x');
    /** @type {string[][]} */
    const calls = [];
    const runCommand = async (/** @type {string} */ file, /** @type {string[]} */ args) => {
      calls.push([file, ...args]);
      return args[0] === 'ps' ? 'abcdef123456\n' : '';
    };
    await cleanupRun('run-1', { tmpdir: dir, runCommand });
    expect(calls).toEqual([
      ['docker', 'ps', '-aq', '--filter', 'label=ghost-run.run-id=run-1'],
      ['docker', 'rm', '-f', '-v', 'abcdef123456'],
    ]);
    await expect(fsp.stat(target)).rejects.toThrow();
  });
});

describe('semaphore', () => {
  it('limits to 2 slots; the third caller is denied after 5 s of (virtual) waiting with the BUSY line', async () => {
    let t = 0;
    const clock = { now: () => t, sleep: async (/** @type {number} */ ms) => void (t += ms) };
    const a = await acquireSlot({ dir, ...clock });
    const b = await acquireSlot({ dir, ...clock });
    expect(a.acquired && b.acquired).toBe(true);
    const third = await acquireSlot({ dir, ...clock });
    expect(third).toEqual({ acquired: false, line: BUSY_LINE });
    expect(t).toBe(5_000);
    expect(BUSY_LINE.startsWith('GHOST RUN GATE BUSY: ')).toBe(true);
    if (a.acquired) await a.release();
    const c = await acquireSlot({ dir, ...clock });
    expect(c.acquired).toBe(true);
  });

  it('releases the slot after a throw', async () => {
    await expect(
      withSlot({ dir, slots: 1, waitMs: 0 }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const again = await withSlot({ dir, slots: 1, waitMs: 0 }, async () => 7);
    expect(again).toEqual({ busy: false, value: 7 });
  });

  it('reclaims a stale slot whose process is gone, and keeps a live one', async () => {
    await fsp.writeFile(path.join(dir, 'slot-0.lock'), JSON.stringify({ pid: 999_999 }));
    const reclaimed = await acquireSlot({ dir, slots: 1, waitMs: 0, isAlive: () => false });
    expect(reclaimed.acquired).toBe(true);
    if (reclaimed.acquired) await reclaimed.release();
    await fsp.writeFile(path.join(dir, 'slot-0.lock'), JSON.stringify({ pid: 4242 }));
    const live = await acquireSlot({ dir, slots: 1, waitMs: 0, isAlive: () => true });
    expect(live.acquired).toBe(false);
  });
});

function dockerAvailable() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

describe('cleanupRun with real Docker', () => {
  it.skipIf(!dockerAvailable())('removes a labelled container', async () => {
    const runId = 'gate-cleanup-test-' + process.pid;
    const image = execFileSync('docker', ['images', '-q'], { encoding: 'utf8' }).split(/\s+/).find(Boolean);
    if (image === undefined) return;
    const name = 'ghost-run-gate-test-' + process.pid;
    execFileSync('docker', [
      'create', '--name', name, '--network', 'none', '--label', `ghost-run.run-id=${runId}`, image, 'true',
    ]);
    try {
      await cleanupRun(runId, { tmpdir: dir });
      const left = execFileSync('docker', ['ps', '-aq', '--filter', `label=ghost-run.run-id=${runId}`], { encoding: 'utf8' });
      expect(left.trim()).toBe('');
    } finally {
      try {
        execFileSync('docker', ['rm', '-f', '-v', name], { stdio: 'ignore' });
      } catch {
        // already removed
      }
    }
  });
});
