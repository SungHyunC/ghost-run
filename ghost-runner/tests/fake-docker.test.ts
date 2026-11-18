import { describe, expect, it } from 'vitest';
import { collectRecorder } from '../src/recorder/collect.js';
import { buildExecArgs, buildRunArgs, auditInspect, expectedMounts, containerName } from '../src/docker/hardening.js';
import { createFakeDocker, cleanRecorderFiles, InjectedFailure } from './fixtures/fake-docker.js';

const hardening = { image: 'ghost-box:test', uid: 1000, gid: 1000 };
const mounts = { copyDir: '/tmp/copy-a' };

async function create(fake: ReturnType<typeof createFakeDocker>, runId: string): Promise<string> {
  const r = await fake.run(buildRunArgs(hardening, runId, mounts));
  expect(r.code).toBe(0);
  return r.stdout.toString().trim();
}

describe('fake docker client', () => {
  it('creates, audits clean, executes with scripted results, and cleans up per run id', async () => {
    const fake = createFakeDocker({ exec: [{ code: 3, stdout: 'x', durationMs: 250 }], recorder: { files: cleanRecorderFiles(1) } });
    const id = await create(fake, 'r1');
    expect(fake.containersFor('r1')).toHaveLength(1);
    expect(fake.volumesFor('r1')).toHaveLength(1);

    const insp = await fake.run(['inspect', id]);
    expect(auditInspect({ image: hardening.image, mounts: expectedMounts(mounts) }, JSON.parse(insp.stdout.toString()))).toEqual({ ok: true });

    const t0 = fake.clock.now();
    const ex = await fake.run(buildExecArgs(containerName('r1'), 0, undefined, 'echo hi'));
    expect(ex).toMatchObject({ code: 3, timedOut: false });
    expect(ex.stdout.toString()).toBe('x');
    expect(fake.clock.now() - t0).toBe(250);

    const rec = await collectRecorder(fake, id, { executedSteps: 1, secretPatterns: [] });
    expect(rec.recorderOk).toBe(true);

    expect((await fake.run(['rm', '-f', '-v', id])).code).toBe(0);
    expect(fake.leakedRunIds()).toEqual([]);
  });

  it('reports a timeout by advancing the fake clock to the limit', async () => {
    const fake = createFakeDocker({ exec: [{ timeout: true }] });
    const id = await create(fake, 'r2');
    const t0 = fake.clock.now();
    const ex = await fake.run(buildExecArgs(id, 0, undefined, 'sleep 99'), { timeoutMs: 30_000 });
    expect(ex).toMatchObject({ code: null, timedOut: true });
    expect(fake.clock.now() - t0).toBe(30_000);
  });

  it('injects exactly one failure at the chosen docker phase', async () => {
    const fake = createFakeDocker({ fault: { phase: 'create' } });
    expect((await fake.run(buildRunArgs(hardening, 'r3', mounts))).code).toBe(1);
    expect(fake.leakedRunIds()).toEqual([]);
    expect((await fake.run(buildRunArgs(hardening, 'r3', mounts))).code).toBe(0);
  });

  it('turns a corrupt collect into a recorder failure', async () => {
    const fake = createFakeDocker({ fault: { phase: 'collect', mode: 'corrupt' } });
    const id = await create(fake, 'r4');
    const rec = await collectRecorder(fake, id, { executedSteps: 0, secretPatterns: [] });
    expect(rec.recorderOk).toBe(false);
  });

  it('flags a scripted isolation violation in the audit', async () => {
    const fake = createFakeDocker({
      mutateInspect: (i) => { (i['HostConfig'] as Record<string, unknown>)['NetworkMode'] = 'bridge'; },
    });
    const id = await create(fake, 'r5');
    const insp = await fake.run(['inspect', id]);
    expect(auditInspect({ image: hardening.image, mounts: expectedMounts(mounts) }, JSON.parse(insp.stdout.toString()))).toMatchObject({ ok: false });
  });

  it('throws once from host phases when armed', async () => {
    const fake = createFakeDocker({ fault: { phase: 'diff' } });
    await expect(fake.enter('copy')).resolves.toBeUndefined();
    await expect(fake.enter('diff')).rejects.toBeInstanceOf(InjectedFailure);
    await expect(fake.enter('diff')).resolves.toBeUndefined();
  });

  it('finds containers by label through ps', async () => {
    const fake = createFakeDocker();
    const id = await create(fake, 'r6');
    const ps = await fake.run(['ps', '-a', '-q', '--filter', 'label=ghost-run.run-id=r6']);
    expect(ps.stdout.toString().trim()).toBe(id);
  });
});
