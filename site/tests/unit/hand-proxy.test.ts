// The page side of the Ghost Hand live engine: it forwards runs to the worker and never throws.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Scheduler } from '../../src/engine/scheduler';
import { HAND_GUARD_MS, HAND_TIMEOUT_MS } from '../../src/live/hand-protocol';
import type { HandRunRequest, HandWorkerReply, HandWorkerRequest } from '../../src/live/hand-protocol';
import { createHandProxy } from '../../src/live/hand-proxy';
import type { HandWorkerLike } from '../../src/live/hand-proxy';
import type { LiveAnswer } from '../../src/live/types';

const INPUT = { world: 'hand' as const, speed: 0.6, force: 20, distance: 0.2 };

class FakeWorker implements HandWorkerLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  sent: HandWorkerRequest[] = [];
  terminated = false;
  postMessage(message: HandWorkerRequest): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(id: number, answer: LiveAnswer): void {
    const message: HandWorkerReply = { type: 'answer', id, answer };
    this.onmessage?.({ data: structuredClone(message) });
  }
  get runs(): HandRunRequest[] {
    return this.sent.filter((m): m is HandRunRequest => m.type === 'run');
  }
}

function fakeScheduler() {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const scheduler: Scheduler = {
    setTimeout(fn, ms) {
      const id = next++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  return { scheduler, timers };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function setup() {
  const workers: FakeWorker[] = [];
  const { scheduler, timers } = fakeScheduler();
  const spawn = vi.fn(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  const engine = createHandProxy({ spawn, scheduler });
  return { engine, workers, spawn, timers };
}

const answer: LiveAnswer = { status: 'rejected', problem: 'out-of-range' };

describe('Ghost Hand proxy', () => {
  it('starts the worker with the engine and sends the three slider values', async () => {
    const { engine, workers, spawn } = setup();
    expect(spawn).toHaveBeenCalledTimes(1);
    const p = engine.run(INPUT);
    await flush();
    expect(workers[0]?.runs).toEqual([{ type: 'run', id: 1, speed: 0.6, force: 20, distance: 0.2 }]);
    workers[0]?.reply(1, answer);
    expect(await p).toEqual(answer);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('serves runs one after the other and ignores an answer with another id', async () => {
    const { engine, workers } = setup();
    const a = engine.run(INPUT);
    const b = engine.run({ ...INPUT, force: 30 });
    await flush();
    expect(workers[0]?.runs).toHaveLength(1);
    workers[0]?.reply(99, { status: 'failed', cause: 'run' });
    workers[0]?.reply(1, answer);
    expect(await a).toEqual(answer);
    await flush();
    expect(workers[0]?.runs.map((r) => r.id)).toEqual([1, 2]);
    workers[0]?.reply(2, { status: 'rejected', problem: 'empty' });
    expect(await b).toEqual({ status: 'rejected', problem: 'empty' });
  });

  it('answers failed for a worker error and starts a fresh worker for the next run', async () => {
    const { engine, workers, spawn } = setup();
    const p = engine.run(INPUT);
    await flush();
    workers[0]?.onerror?.({ message: 'Script error' });
    expect(await p).toEqual({ status: 'failed', cause: 'load', detail: 'worker error: Script error' });
    expect(workers[0]?.terminated).toBe(true);
    const q = engine.run(INPUT);
    await flush();
    expect(spawn).toHaveBeenCalledTimes(2);
    workers[1]?.reply(2, answer);
    expect(await q).toEqual(answer);
    // After an answer an error is a run failure, not a load failure.
    const r = engine.run(INPUT);
    await flush();
    workers[1]?.onerror?.({ message: 'boom' });
    expect(await r).toMatchObject({ status: 'failed', cause: 'run' });
  });

  it('answers a timeout when the worker stays silent past the 30 s limit and the guard, and stops it', async () => {
    const { engine, workers, timers } = setup();
    const p = engine.run(INPUT);
    await flush();
    expect([...timers.values()].map((t) => t.ms)).toEqual([HAND_TIMEOUT_MS + HAND_GUARD_MS]);
    [...timers.values()][0]?.fn();
    expect(await p).toMatchObject({ status: 'failed', cause: 'timeout' });
    expect(workers[0]?.terminated).toBe(true);
    expect(timers.size).toBe(0);
  });

  it('clears its timer when the answer comes in time', async () => {
    const { engine, workers, timers } = setup();
    const p = engine.run(INPUT);
    await flush();
    workers[0]?.reply(1, answer);
    await p;
    expect(timers.size).toBe(0);
  });

  it('answers failed internal for another world and never throws', async () => {
    const { engine } = setup();
    expect(await engine.run({ world: 'cloud', lines: ['x'] })).toEqual({ status: 'failed', cause: 'internal' });
  });

  it('tells the worker to stop on dispose, ends the pending run, and refuses later runs', async () => {
    const { engine, workers } = setup();
    const p = engine.run(INPUT);
    await flush();
    engine.dispose();
    expect(workers[0]?.sent.at(-1)).toEqual({ type: 'dispose' });
    expect(workers[0]?.terminated).toBe(true);
    expect(await p).toMatchObject({ status: 'failed', cause: 'run' });
    expect(await engine.run(INPUT)).toMatchObject({ status: 'failed', cause: 'run' });
  });

  it('fails to load when the worker cannot be started', () => {
    expect(() =>
      createHandProxy({
        spawn: () => {
          throw new Error('no worker');
        },
      }),
    ).toThrow('no worker');
  });

  it('keeps every answer plain data: it survives a structured clone', () => {
    const plain: LiveAnswer = { status: 'failed', cause: 'run', detail: 'x' };
    expect(structuredClone(plain)).toEqual(plain);
  });
});

describe('the page chunk of the Hand engine', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, '../../src/live', rel), 'utf8');
  const imports = (text: string) => [...text.matchAll(/^import[^;]*from\s+'([^']+)'/gm)].map((m) => m[1] ?? '');

  it('imports no MuJoCo, world, or app code: the page policy forbids what MuJoCo runs', () => {
    for (const file of ['engine-hand.ts', 'hand-proxy.ts', 'hand-protocol.ts']) {
      for (const spec of imports(read(file))) {
        expect(spec, `${file} -> ${spec}`).not.toMatch(/drawer-arm|mujoco|apps\/|worlds\/|@ghost-run\//);
      }
    }
  });

  it('runs the world, the pipeline, and the fingerprints in the worker module', () => {
    const worker = read('hand-worker.ts');
    expect(worker).toContain("createGhostHandWorld");
    expect(worker).toContain("from './hand'");
    expect(worker).toContain('probeCapabilities');
    expect(read('engine-hand.ts')).toContain("new URL('./hand-worker.ts', import.meta.url)");
    expect(read('engine-hand.ts')).toContain("type: 'module'");
  });
});
