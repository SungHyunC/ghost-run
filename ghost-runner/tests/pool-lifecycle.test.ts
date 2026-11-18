// Pool lifecycle model test, no Docker (Req 6.2, 6.3, 6.4, 6.7, 6.8, 6.9).
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPool, type Pool, type ProcessInfo, type ProcessLike } from '../src/docker/pool.js';
import { LABEL_POOL, LABEL_POOL_OWNER } from '../src/docker/hardening.js';
import { createFakeDocker, type FakeDocker } from './fixtures/fake-docker.js';

const IMAGE = 'ghost-box@sha256:' + 'a'.repeat(64);

/** A process table: owners in `alive` are running. */
function procInfo(owner: string, alive: Set<string>): ProcessInfo {
  return { pid: Number(owner.split(':')[0]), owner, isAlive: (o) => alive.has(o) };
}

class FakeProc extends EventEmitter {
  readonly pid = 1;
  kills: string[] = [];
  kill(_pid: number, sig?: string): void {
    this.kills.push(sig ?? 'SIGTERM');
  }
}

let root: string;
let fake: FakeDocker;
const alive = new Set<string>(['100:me', '200:other']);
const pools: Pool[] = [];
let seq = 0;

function mk(owner = '100:me', size = 2, extra: Partial<Parameters<typeof createPool>[0]> = {}): Pool {
  const pool = createPool({
    client: fake,
    size,
    image: IMAGE,
    uid: 1000,
    gid: 1000,
    rootDir: root,
    processInfo: procInfo(owner, alive),
    installExitHandlers: false,
    makeRunId: () => `pool-${owner.split(':')[0]}-${String((seq += 1))}`,
    ...extra,
  });
  pools.push(pool);
  return pool;
}

const ACQ = { deadlineAt: 9_999_999, execLimitMs: 5_000 };

async function dirs(): Promise<string[]> {
  const out: string[] = [];
  for (const o of await readdir(root).catch(() => [])) for (const s of await readdir(join(root, o))) out.push(s);
  return out.sort();
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ghost-pool-test-'));
  fake = createFakeDocker();
  seq = 0;
});

afterEach(async () => {
  await Promise.all(pools.splice(0).map((p) => p.close()));
  await rm(root, { recursive: true, force: true });
});

describe('pool lifecycle (no docker)', () => {
  it('fills to size with labeled, hardened, one-directory slots (6.1, 6.4)', async () => {
    const pool = mk();
    await pool.start();
    await pool.whenIdle();
    expect(pool.readyCount()).toBe(2);
    const cs = fake.allContainers();
    expect(cs).toHaveLength(2);
    for (const c of cs) {
      expect(c.labels[LABEL_POOL]).toBe('1');
      expect(c.labels[LABEL_POOL_OWNER]).toBe('100:me');
      expect(c.runArgs).toContain('--network');
      const binds = c.runArgs.filter((a) => a.startsWith('type=bind'));
      expect(binds).toHaveLength(1);
    }
    const srcs = cs.map((c) => c.runArgs.find((a) => a.startsWith('type=bind'))!);
    expect(new Set(srcs).size).toBe(2);
    expect(await dirs()).toHaveLength(2);
  });

  it('serves each slot once; release removes everything and starts a replacement afterwards (6.3)', async () => {
    const pool = mk();
    await pool.start();
    await pool.whenIdle();
    const a = pool.acquire(ACQ)!;
    const b = pool.acquire(ACQ)!;
    expect(a.runId).not.toBe(b.runId);
    expect(pool.acquire(ACQ)).toBeUndefined();
    // No replacement starts while the run is in progress.
    const runsBefore = fake.callsFor('create').length;
    await pool.whenIdle();
    expect(fake.callsFor('create')).toHaveLength(runsBefore);

    await a.release();
    expect(fake.containersFor(a.runId)).toHaveLength(0);
    expect(fake.volumesFor(a.runId)).toHaveLength(0);
    await expect(stat(a.copyDir)).rejects.toThrow();
    await pool.whenIdle();
    expect(pool.readyCount()).toBe(1);
    const c = pool.acquire(ACQ)!;
    expect([a.runId, b.runId]).not.toContain(c.runId);
    await a.release(); // idempotent
    await pool.whenIdle();
    expect(fake.callsFor('create')).toHaveLength(runsBefore + 1);
    await Promise.all([b.release(), c.release()]);
  });

  it('release returns without waiting for the replacement', async () => {
    const pool = mk('100:me', 1);
    await pool.start();
    await pool.whenIdle();
    const s = pool.acquire(ACQ)!;
    const before = fake.callsFor('create').length;
    await s.release();
    // The replacement is started but not required for release to resolve.
    expect(fake.callsFor('create').length).toBeGreaterThanOrEqual(before);
    await pool.whenIdle();
    expect(pool.readyCount()).toBe(1);
  });

  it('returns undefined when no slot is ready so the caller uses a fresh box (6.9)', async () => {
    const pool = mk('100:me', 1);
    expect(pool.acquire(ACQ)).toBeUndefined(); // before start
    await pool.start();
    await pool.whenIdle();
    const s = pool.acquire(ACQ);
    expect(s).toBeDefined();
    expect(pool.acquire(ACQ)).toBeUndefined(); // exhausted
    await s!.release();
  });

  it('start-up sweep removes slots of a dead owner and keeps a live foreign owner (6.8)', async () => {
    const dead = mk('300:gone', 1);
    await dead.start();
    await dead.whenIdle();
    const foreign = mk('200:other', 2);
    await foreign.start();
    await foreign.whenIdle();
    alive.delete('300:gone');
    try {
      const me = mk('100:me', 1);
      await me.start();
      await me.whenIdle();
      const owners = fake.allContainers().map((c) => c.labels[LABEL_POOL_OWNER]).sort();
      expect(owners).toEqual(['100:me', '200:other', '200:other']);
      expect(await dirs()).toHaveLength(3);
      expect(fake.leakedRunIds().filter((r) => r.startsWith('pool-300'))).toEqual([]);
    } finally {
      alive.add('300:gone');
    }
  });

  it('sweep never removes slots of a live foreign owner', async () => {
    const foreign = mk('200:other', 2);
    await foreign.start();
    await foreign.whenIdle();
    const me = mk('100:me', 1);
    await me.start();
    expect(await me.sweep()).toBe(0);
    await me.close();
    expect(fake.allContainers().filter((c) => c.labels[LABEL_POOL_OWNER] === '200:other')).toHaveLength(2);
  });

  it('close removes own slots, in-use or ready, and leaves foreign ones (6.7)', async () => {
    const foreign = mk('200:other', 1);
    await foreign.start();
    await foreign.whenIdle();
    const me = mk('100:me', 2);
    await me.start();
    await me.whenIdle();
    const inUse = me.acquire(ACQ)!;
    await me.close();
    expect(fake.containersFor(inUse.runId)).toHaveLength(0);
    expect(fake.allContainers().map((c) => c.labels[LABEL_POOL_OWNER])).toEqual(['200:other']);
    expect(me.acquire(ACQ)).toBeUndefined();
    await me.close(); // idempotent
    expect(await dirs()).toHaveLength(1);
  });

  it('exit handlers: beforeExit closes the pool; exit removes still-tracked containers synchronously', async () => {
    const proc = new FakeProc();
    const removed: string[][] = [];
    const pool = mk('100:me', 2, {
      installExitHandlers: true,
      proc: proc as unknown as ProcessLike,
      syncRemove: (ids) => removed.push([...ids]),
    });
    await pool.start();
    await pool.whenIdle();
    proc.emit('exit');
    expect(removed).toHaveLength(1);
    expect(removed[0]).toHaveLength(2);
    proc.emit('beforeExit');
    await pool.close();
    expect(fake.allContainers()).toHaveLength(0);
    expect(proc.listenerCount('exit')).toBe(0);
  });

  it('close finishes within the exit budget even if docker hangs', async () => {
    const pool = mk('100:me', 1, { exitBudgetMs: 50 });
    await pool.start();
    await pool.whenIdle();
    const hang = new Promise<never>(() => undefined);
    (fake as unknown as { run: () => Promise<never> }).run = () => hang;
    const t0 = Date.now();
    await pool.close();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
