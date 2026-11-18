import { describe, expect, it } from 'vitest';
import { createBox, removeRunContainers, type BoxParams } from '../src/docker/box.js';
import { containerName } from '../src/docker/hardening.js';
import { cleanRecorderFiles, createFakeDocker, type FakeDocker, type FakeDockerOptions } from './fixtures/fake-docker.js';

const IMAGE = `sha256:${'b'.repeat(64)}`;

function params(fake: FakeDocker, runId: string, over: Partial<BoxParams> = {}): BoxParams {
  return {
    runId,
    image: IMAGE,
    mounts: { copyDir: '/tmp/copy-a' },
    uid: 1000,
    gid: 1000,
    execLimitMs: 25_000,
    deadlineAt: fake.clock.now() + 55_000,
    clock: fake.clock,
    ...over,
  };
}

async function open(opts: FakeDockerOptions, runId = 'run-1', over: Partial<BoxParams> = {}) {
  const fake = createFakeDocker(opts);
  const r = await createBox(fake, params(fake, runId, over));
  return { fake, r };
}

describe('createBox', () => {
  it('creates a labelled, audited box and removes it with its volume on cleanup', async () => {
    const { fake, r } = await open({});
    if (!r.ok) throw new Error('expected box');
    expect(fake.containersFor('run-1')).toHaveLength(1);
    expect(fake.containersFor('run-1')[0]?.labels['ghost-run.run-id']).toBe('run-1');
    expect(fake.volumesFor('run-1')).toHaveLength(1);
    expect(await r.box.cleanup()).toEqual({ ok: true });
    expect(fake.leakedRunIds()).toEqual([]);
    expect(await r.box.cleanup()).toEqual({ ok: true });
  });

  it('removes the container and runs no action when the audit finds a deviation', async () => {
    const { fake, r } = await open({
      mutateInspect: (i) => { (i['HostConfig'] as Record<string, unknown>)['NetworkMode'] = 'bridge'; },
    });
    expect(r).toMatchObject({ ok: false, kind: 'isolation-violation', cleanup: { ok: true } });
    if (!r.ok && r.kind === 'isolation-violation') expect(r.differences.join(' ')).toContain('network');
    expect(fake.leakedRunIds()).toEqual([]);
    expect(fake.callsFor('exec')).toHaveLength(0);
  });

  it('treats a failed inspect as an isolation violation', async () => {
    const { fake, r } = await open({ fault: { phase: 'audit' } });
    expect(r).toMatchObject({ ok: false, kind: 'isolation-violation' });
    expect(fake.leakedRunIds()).toEqual([]);
  });

  it('reports create-failed and sweeps by run-id label when docker run fails', async () => {
    for (const mode of ['exit', 'timeout', 'spawn-error'] as const) {
      const { fake, r } = await open({ fault: { phase: 'create', mode } });
      expect(r).toMatchObject({ ok: false, kind: 'create-failed', cleanup: { ok: true } });
      expect(fake.leakedRunIds()).toEqual([]);
    }
  });

  it('passes an image id and accepts image-baked environment through the audit', async () => {
    const fake = createFakeDocker({
      mutateInspect: (i) => { (i['Config'] as { Env: string[] }).Env.push('NODE_VERSION=20'); },
    });
    const without = await createBox(fake, params(fake, 'a'));
    expect(without).toMatchObject({ ok: false, kind: 'isolation-violation' });
    const withEnv = await createBox(fake, params(fake, 'b', { imageEnv: ['NODE_VERSION=20'] }));
    expect(withEnv.ok).toBe(true);
  });
});

describe('Box.exec', () => {
  it('runs each action with its exit code and charges the duration to the budget', async () => {
    const { fake, r } = await open({ exec: [{ code: 3, stdout: 'out', durationMs: 4_000 }, { durationMs: 1_000 }] });
    if (!r.ok) throw new Error('expected box');
    const first = await r.box.exec(0, 'echo hi', 'sub');
    expect(first).toMatchObject({ kind: 'exited', exitCode: 3, durationMs: 4_000 });
    expect(r.box.execBudgetLeftMs()).toBe(21_000);
    await r.box.exec(1, 'true');
    expect(r.box.execBudgetLeftMs()).toBe(20_000);
    const call = fake.callsFor('exec')[0];
    expect(call?.args.slice(-3)).toEqual(['0', 'sub', 'echo hi']);
    expect(call?.args).toContain(r.box.containerId);
  });

  it('kills the container when the total execution limit is reached and still collects the recorder', async () => {
    const { fake, r } = await open(
      { exec: [{ durationMs: 2_000 }, { timeout: true }], recorder: { files: cleanRecorderFiles(1) } },
      'run-t',
      { execLimitMs: 5_000 },
    );
    if (!r.ok) throw new Error('expected box');
    expect(await r.box.exec(0, 'a')).toMatchObject({ kind: 'exited' });
    const t0 = fake.clock.now();
    expect(await r.box.exec(1, 'sleep 99')).toMatchObject({ kind: 'timeout', reason: 'exec-limit' });
    expect(fake.clock.now() - t0).toBe(3_000);
    expect(r.box.killed).toBe(true);
    expect(fake.calls.some((c) => c.args[0] === 'kill')).toBe(true);
    expect(fake.containersFor('run-t')[0]?.running).toBe(false);

    expect(await r.box.exec(2, 'later')).toMatchObject({ kind: 'error' });
    const rec = await r.box.collect({ executedSteps: 1, secretPatterns: [] });
    expect(rec.recorderOk).toBe(true);
    expect(fake.callsFor('collect')).toHaveLength(1);

    expect(await r.box.cleanup()).toEqual({ ok: true });
    expect(fake.leakedRunIds()).toEqual([]);
  });

  it('reports pipeline-deadline when the deadline, not the execution limit, is the tighter bound', async () => {
    const fake = createFakeDocker({ exec: [{ timeout: true }] });
    const r = await createBox(fake, params(fake, 'run-d', { deadlineAt: fake.clock.now() + 1_500 }));
    if (!r.ok) throw new Error('expected box');
    expect(await r.box.exec(0, 'sleep 99')).toMatchObject({ kind: 'timeout', reason: 'pipeline-deadline' });
    expect(r.box.killed).toBe(true);
  });

  it('kills without executing when the budget is already used up', async () => {
    const { fake, r } = await open({}, 'run-b', { execLimitMs: 0 });
    if (!r.ok) throw new Error('expected box');
    expect(await r.box.exec(0, 'b')).toMatchObject({ kind: 'timeout', reason: 'exec-limit', durationMs: 0 });
    expect(fake.callsFor('exec')).toHaveLength(0);
    expect(r.box.killed).toBe(true);
  });

  it('returns an error value, not an exception, when docker exec cannot start', async () => {
    const { r } = await open({ fault: { phase: 'exec', mode: 'spawn-error' } });
    if (!r.ok) throw new Error('expected box');
    expect(await r.box.exec(0, 'a')).toMatchObject({ kind: 'error' });
  });
});

describe('Box.collect', () => {
  it('turns a corrupt stream into a recorder failure without throwing', async () => {
    const { r } = await open({ fault: { phase: 'collect', mode: 'corrupt' } });
    if (!r.ok) throw new Error('expected box');
    expect((await r.box.collect({ executedSteps: 0, secretPatterns: [] })).recorderOk).toBe(false);
  });
});

describe('removeRunContainers', () => {
  it('finds a container by run-id label when no reference is known', async () => {
    const fake = createFakeDocker();
    await fake.run(['run', '-d', '--name', containerName('orphan'), '--label', 'ghost-run.run-id=orphan', IMAGE]);
    expect(fake.leakedRunIds()).toEqual(['orphan']);
    expect(await removeRunContainers(fake, 'orphan')).toEqual({ ok: true });
    expect(fake.leakedRunIds()).toEqual([]);
  });

  it('treats an already removed container as success', async () => {
    const fake = createFakeDocker();
    expect(await removeRunContainers(fake, 'gone', 'gone')).toEqual({ ok: true });
  });
});
