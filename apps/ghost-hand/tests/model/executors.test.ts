import { describe, expect, it } from 'vitest';
import type { GhostHandWorld, VariantJob, VariantOutcome } from '@ghost-run/drawer-arm';
import { failedOutcome, poolSizeFor } from '../../src/exec/executor';
import { createInlineExecutor } from '../../src/exec/inline';
import { createPoolExecutor } from '../../src/exec/pool';
import type { WorkerLike } from '../../src/exec/pool';
import { createExecutor } from '../../src/exec/select';

const PARAMS = {} as unknown as VariantJob['params'];

function job(index: number): VariantJob {
  return { index, params: PARAMS, startState: {} as VariantJob['startState'], actions: [], recordFrames: false };
}

function outcome(index: number, tag = 'ok'): VariantOutcome {
  return { ...failedOutcome(job(index), ''), engineError: undefined, trajectoryHash: `${tag}-${index}` };
}

type Behavior = (job: VariantJob) => { delayMs: number; fail?: 'error' | 'messageerror' };

/** A fake worker that answers after a delay chosen per job. */
function fakeWorker(behavior: Behavior, log: { spawned: number; terminated: number }): WorkerLike {
  log.spawned += 1;
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message) {
      const j = (message as { job: VariantJob }).job;
      const b = behavior(j);
      setTimeout(() => {
        if (b.fail === 'error') w.onerror?.({ message: 'boom' });
        else if (b.fail === 'messageerror') w.onmessageerror?.({});
        else w.onmessage?.({ data: { outcome: outcome(j.index, 'worker') } });
      }, b.delayMs);
    },
    terminate() {
      log.terminated += 1;
    },
  };
  return w;
}

describe('poolSizeFor', () => {
  it('is clamp(hardwareConcurrency - 1, 1, 4)', () => {
    expect([undefined, 0, 1, 2, 3, 5, 6, 64].map(poolSizeFor)).toEqual([1, 1, 1, 1, 2, 4, 4, 4]);
  });
});

describe('pool executor', () => {
  it('orders results by job index, not by arrival', async () => {
    const log = { spawned: 0, terminated: 0 };
    // Lower indices answer last.
    const pool = createPoolExecutor({ size: 4, spawn: () => fakeWorker((j) => ({ delayMs: (8 - j.index) * 5 }), log) });
    const jobs = Array.from({ length: 8 }, (_, i) => job(i));
    const out = await pool.run(jobs);
    expect(out.map((o) => o.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(out.every((o) => o.trajectoryHash.startsWith('worker'))).toBe(true);
    expect(log.spawned).toBeLessThanOrEqual(4);
    expect(log.terminated).toBe(log.spawned);
    pool.dispose();
  });

  it('never starts more than 4 workers', async () => {
    const log = { spawned: 0, terminated: 0 };
    const pool = createPoolExecutor({ size: 16, spawn: () => fakeWorker(() => ({ delayMs: 1 }), log) });
    await pool.run(Array.from({ length: 20 }, (_, i) => job(i)));
    expect(log.spawned).toBe(4);
  });

  it('retries a worker error and a messageerror once inline', async () => {
    const log = { spawned: 0, terminated: 0 };
    const retried: number[] = [];
    const pool = createPoolExecutor({
      size: 2,
      spawn: () => fakeWorker((j) => ({ delayMs: 1, fail: j.index === 1 ? 'error' : j.index === 2 ? 'messageerror' : undefined }), log),
      retry: async (j) => {
        retried.push(j.index);
        return outcome(j.index, 'inline');
      },
    });
    const out = await pool.run([job(0), job(1), job(2), job(3)]);
    expect(retried.sort()).toEqual([1, 2]);
    expect(out.map((o) => o.trajectoryHash)).toEqual(['worker-0', 'inline-1', 'inline-2', 'worker-3']);
  });

  it('reports engineError when the retry also fails', async () => {
    const log = { spawned: 0, terminated: 0 };
    const pool = createPoolExecutor({
      size: 1,
      spawn: () => fakeWorker(() => ({ delayMs: 1, fail: 'error' }), log),
      retry: async () => {
        throw new Error('inline failed');
      },
    });
    const out = await pool.run([job(0), job(1)]);
    expect(out.map((o) => o.index)).toEqual([0, 1]);
    expect(out.map((o) => o.engineError)).toEqual(['inline failed', 'inline failed']);
  });

  it('falls back to the retry when no worker can be started', async () => {
    const pool = createPoolExecutor({
      size: 2,
      spawn: () => {
        throw new Error('no workers');
      },
      retry: async (j) => outcome(j.index, 'inline'),
    });
    const out = await pool.run([job(0), job(1), job(2)]);
    expect(out.map((o) => o.trajectoryHash)).toEqual(['inline-0', 'inline-1', 'inline-2']);
  });
});

describe('inline executor and selection', () => {
  function fakeWorld(counter: { made: number; disposed: number }): Promise<GhostHandWorld> {
    counter.made += 1;
    return Promise.resolve({ dispose: () => void (counter.disposed += 1) } as unknown as GhostHandWorld);
  }

  it('makes one world of its own, runs jobs by index, and disposes it', async () => {
    const counter = { made: 0, disposed: 0 };
    const exec = createInlineExecutor(
      () => fakeWorld(counter),
      async (_w, j) => {
        if (j.index === 1) throw new Error('bad job');
        return outcome(j.index);
      },
    );
    const out = await exec.run([job(0), job(1), job(2)]);
    await exec.run([job(0)]);
    expect(counter.made).toBe(1);
    expect(out.map((o) => o.engineError)).toEqual([undefined, 'bad job', undefined]);
    exec.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(counter.disposed).toBe(1);
    await expect(exec.run([job(0)])).rejects.toThrow('disposed');
  });

  it('uses the inline executor in Node even when a spawn function exists', async () => {
    const counter = { made: 0, disposed: 0 };
    let spawned = 0;
    const exec = createExecutor({
      factory: () => fakeWorld(counter),
      spawn: () => {
        spawned += 1;
        return fakeWorker(() => ({ delayMs: 1 }), { spawned: 0, terminated: 0 });
      },
    });
    // The fake world has no real engine, so every job reports an engineError from the real runner.
    const out = await exec.run([job(0)]);
    expect(spawned).toBe(0);
    expect(counter.made).toBe(1);
    expect(out[0]?.index).toBe(0);
    exec.dispose();
  });

  it('uses the inline executor without Worker', async () => {
    const counter = { made: 0, disposed: 0 };
    let spawned = 0;
    const exec = createExecutor({
      factory: () => fakeWorld(counter),
      spawn: () => {
        spawned += 1;
        return fakeWorker(() => ({ delayMs: 1 }), { spawned: 0, terminated: 0 });
      },
      isNode: false,
      hasWorker: false,
    });
    await exec.run([job(0)]);
    expect(spawned).toBe(0);
    exec.dispose();
  });

  it('uses the pool in a browser with Worker', async () => {
    const counter = { made: 0, disposed: 0 };
    let spawned = 0;
    const exec = createExecutor({
      factory: () => fakeWorld(counter),
      spawn: () => {
        spawned += 1;
        return fakeWorker(() => ({ delayMs: 1 }), { spawned: 0, terminated: 0 });
      },
      isNode: false,
      hasWorker: true,
      hardwareConcurrency: 8,
    });
    const out = await exec.run([job(0), job(1)]);
    expect(spawned).toBeGreaterThan(0);
    expect(out.map((o) => o.trajectoryHash)).toEqual(['worker-0', 'worker-1']);
    exec.dispose();
  });
});
