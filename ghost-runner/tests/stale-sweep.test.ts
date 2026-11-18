// Stale-box sweep at run start (Req 16.7). [no-docker] fake Docker client only.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DockerCallOptions, DockerClient, DockerResult } from '../src/docker/cli.js';
import { containerName } from '../src/docker/hardening.js';
import { processInfo } from '../src/docker/owner.js';
import { resetStaleSweepForTests, sweepStaleBoxes } from '../src/docker/stale-sweep.js';
import { runPlan } from '../src/pipeline.js';
import { cleanRecorderFiles, createFakeDocker, type FakeDocker } from './fixtures/fake-docker.js';

const IMAGE = 'ghost-run/box:test';
/** A pid that cannot exist on Linux or macOS (above every pid_max). */
const DEAD_OWNER = '999999999:Mon Jan 1 00:00:00 2001';

const dirs: string[] = [];
beforeEach(() => resetStaleSweepForTests());
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'ghost-stale-'));
  dirs.push(root);
  writeFileSync(join(root, 'seed.txt'), 'seed\n');
  return root;
}

async function seed(fake: FakeDocker, runId: string, owner: string | undefined): Promise<void> {
  const labels = ['--label', `ghost-run.run-id=${runId}`, ...(owner !== undefined ? ['--label', `ghost-run.owner=${owner}`] : [])];
  await fake.run(['run', '-d', '--name', containerName(runId), ...labels, IMAGE]);
  await fake.run(['stop', containerName(runId)]);
}

describe('stale-box sweep', () => {
  it('removes a dead owner, keeps live foreign owner, current process, and unlabeled boxes', async () => {
    const fake = createFakeDocker({ recorder: { files: cleanRecorderFiles(1) } });
    const live = processInfo().owner; // this process: alive and current
    await seed(fake, 'dead-1', DEAD_OWNER);
    await seed(fake, 'cur-1', live);
    await seed(fake, 'foreign-1', live);
    await seed(fake, 'plain-1', undefined);
    const info = { pid: 1, owner: '1:other', isAlive: (o: string): boolean => o === live };
    const r = await sweepStaleBoxes(fake, info);
    expect(r).toEqual({ removed: 1 });
    expect(fake.containersFor('dead-1')).toHaveLength(0);
    expect(fake.containersFor('cur-1')).toHaveLength(1);
    expect(fake.containersFor('foreign-1')).toHaveLength(1);
    expect(fake.containersFor('plain-1')).toHaveLength(1);
  });

  it('never removes the current process owner even when liveness says dead', async () => {
    const fake = createFakeDocker();
    await seed(fake, 'me-1', 'me:x');
    const r = await sweepStaleBoxes(fake, { pid: 1, owner: 'me:x', isAlive: () => false });
    expect(r.removed).toBe(0);
    expect(fake.containersFor('me-1')).toHaveLength(1);
  });

  it('tolerates a failing list call', async () => {
    const client: DockerClient = {
      run: (): Promise<DockerResult> => Promise.resolve({ code: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('boom'), timedOut: false }),
    };
    const r = await sweepStaleBoxes(client);
    expect(r.removed).toBe(0);
    expect(r.error).toBeDefined();
  });

  it('runPlan sweeps once per process, labels its own box, and records a failed sweep as a diagnostic', async () => {
    const fake = createFakeDocker({ recorder: { files: cleanRecorderFiles(1) } });
    await seed(fake, 'dead-2', DEAD_OWNER);
    const first = await runPlan([{ command: 'true' }], { original: repo(), client: fake });
    expect(first.result.diagnostics.some((d) => d.name === 'stale-sweep-failed')).toBe(false);
    expect(fake.containersFor('dead-2')).toHaveLength(0);
    const run = fake.callsFor('create').find((c) => c.args.some((a) => a.startsWith('ghost-run.run-id=') && !a.endsWith('dead-2')));
    expect(run?.args).toContain(`ghost-run.owner=${processInfo().owner}`);

    await seed(fake, 'dead-3', DEAD_OWNER);
    await runPlan([{ command: 'true' }], { original: repo(), client: fake });
    expect(fake.containersFor('dead-3')).toHaveLength(1); // not swept a second time
  });

  it('a failing sweep never fails the run', async () => {
    const fake = createFakeDocker({ recorder: { files: cleanRecorderFiles(1) } });
    const client: DockerClient = {
      run(args: readonly string[], o?: DockerCallOptions): Promise<DockerResult> {
        if (args[0] === 'ps' && args.includes('--format') && args.some((a) => a === 'label=ghost-run.owner')) {
          return Promise.resolve({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: true });
        }
        return fake.run(args, o);
      },
    };
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client, clock: fake.clock });
    expect(result.status).toBe('ok');
    expect(result.diagnostics.some((d) => d.name === 'stale-sweep-failed')).toBe(true);
  });
});
