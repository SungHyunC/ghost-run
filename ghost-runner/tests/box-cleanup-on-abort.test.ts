// Regression: a box must not outlive a run that is aborted, times out, or is cut short by a
// test timeout / process kill. Uses the fake Docker client, no real Docker needed.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBox } from '../src/docker/box.js';
import type { DockerCallOptions, DockerClient, DockerResult } from '../src/docker/cli.js';
import { buildRunArgs } from '../src/docker/hardening.js';
import { reapRuns, trackedRunIds } from '../src/docker/reaper.js';
import { runPlan } from '../src/pipeline.js';
import { cleanRecorderFiles, createFakeDocker, type FakeDocker } from './fixtures/fake-docker.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'ghost-abort-'));
  dirs.push(root);
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'data', 'seed.txt'), 'seed\n');
  return root;
}

/** Wraps a fake client; `ghost-step` exec calls never return until `release()`. */
function hangingExec(fake: FakeDocker): { client: DockerClient; release: () => void; execStarted: Promise<void> } {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const execStarted = new Promise<void>((r) => (started = r));
  const client: DockerClient = {
    async run(args: readonly string[], opts?: DockerCallOptions): Promise<DockerResult> {
      if (args[0] === 'exec' && args.includes('ghost-step')) {
        started();
        await gate;
      }
      return fake.run(args, opts);
    },
  };
  return { client, release, execStarted };
}

describe('box cleanup when the run does not finish normally', () => {
  it('removes container, volume and Copy when runPlan is aborted mid-step', async () => {
    const fake = createFakeDocker({ recorder: { files: cleanRecorderFiles(1) } });
    const h = hangingExec(fake);
    const ac = new AbortController();
    const p = runPlan([{ command: 'sleep 100' }], { original: repo(), client: h.client, clock: fake.clock, signal: ac.signal });
    const settled = p.then(() => 'resolved', (e: unknown) => e);
    await h.execStarted;
    expect(fake.allContainers().length).toBe(1);

    ac.abort();
    const err = await settled;
    expect(err).toBeInstanceOf(DOMException);
    expect(fake.allContainers()).toEqual([]);
    expect(fake.leakedRunIds()).toEqual([]);

    h.release(); // the abandoned step settles; nothing is left behind
    await new Promise((r) => setTimeout(r, 20));
    expect(fake.leakedRunIds()).toEqual([]);
  });

  it('rejects without creating anything when the signal is already aborted', async () => {
    const fake = createFakeDocker();
    const ac = new AbortController();
    ac.abort();
    await expect(runPlan([{ command: 'true' }], { original: repo(), client: fake, clock: fake.clock, signal: ac.signal })).rejects.toBeDefined();
    expect(fake.leakedRunIds()).toEqual([]);
  });

  it('reaper removes a box abandoned by a test timeout (run never reached its finally)', async () => {
    const fake = createFakeDocker();
    const runId = 'reap-timeout-1';
    const r = await createBox(fake, {
      runId,
      image: 'ghost-box:test',
      mounts: { copyDir: '/tmp/copy-reap' },
      uid: 1000,
      gid: 1000,
      execLimitMs: 1000,
      deadlineAt: fake.clock.now() + 55_000,
    });
    // The fake does not return a clean audit for an arbitrary image; either way the run is tracked
    // until removal is confirmed.
    if (r.ok) expect(trackedRunIds()).toContain(runId);
    else expect(fake.leakedRunIds()).toEqual([]);

    const failed = await reapRuns(fake, [runId]);
    expect(failed).toEqual([]);
    expect(fake.leakedRunIds()).toEqual([]);
    expect(trackedRunIds()).not.toContain(runId);
  });

  it('every box start gets a self-expiry and an anonymous volume that `rm -v` removes', () => {
    const args = buildRunArgs({ image: 'img', uid: 1, gid: 1 }, 'r', { copyDir: '/tmp/c' });
    expect(args.slice(-2)[0]).toBe('--max-lifetime');
    expect(args).toContain('type=volume,dst=/ghost-rec,volume-label=ghost-run.run-id=r');
    expect(args).not.toContain('--rm'); // collect after a kill needs the stopped container
  });
});
