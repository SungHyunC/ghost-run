// [docker] A stopped box of a dead owner is removed, with its volume, by the next runPlan (Req 16.7).
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { checkDockerAvailability } from '../src/docker/availability.js';
import { createDockerClient } from '../src/docker/cli.js';
import { containerName } from '../src/docker/hardening.js';
import { resetStaleSweepForTests } from '../src/docker/stale-sweep.js';
import { runPlan } from '../src/pipeline.js';
import { describeDocker } from './docker-available.js';

const client = createDockerClient();
const text = (b: Buffer): string => b.toString('utf8');

describeDocker('stale-box sweep (docker)', () => {
  let dir = '';
  let image = '';
  const runId = `stale-${randomUUID()}`;
  let deadPid = 0;

  const ids = async (): Promise<string[]> => {
    const r = await client.run(['ps', '-a', '-q', '--filter', `label=ghost-run.run-id=${runId}`]);
    return text(r.stdout).split('\n').map((s) => s.trim()).filter((s) => s !== '');
  };
  const volumes = async (): Promise<string[]> => {
    const r = await client.run(['volume', 'ls', '-q', '--filter', `label=ghost-run.run-id=${runId}`]);
    return text(r.stdout).split('\n').map((s) => s.trim()).filter((s) => s !== '');
  };

  beforeAll(async () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'ghost-stale-')));
    writeFileSync(join(dir, 'a.txt'), 'x\n');
    const avail = await checkDockerAvailability(client, { limitMs: 10_000 });
    if (!avail.available) throw new Error(`box image unavailable: ${avail.reason}`);
    image = avail.imageRef;
    // A pid that is dead: a child that has already exited.
    deadPid = spawnSync(process.execPath, ['-e', '0']).pid;
    const run = await client.run([
      'create', '--name', containerName(runId),
      '--label', `ghost-run.run-id=${runId}`,
      '--label', `ghost-run.owner=${String(deadPid)}:Mon Jan 1 00:00:00 2001`,
      '--mount', `type=volume,dst=/ghost-rec,volume-label=ghost-run.run-id=${runId}`,
      '--entrypoint', 'ghost-init', image, '--max-lifetime', '5',
    ]);
    if (run.code !== 0) throw new Error(`seed box not created: ${text(run.stderr)}`);
  }, 60_000);

  afterAll(async () => {
    for (const id of await ids()) await client.run(['rm', '-f', '-v', id]);
    for (const v of await volumes()) await client.run(['volume', 'rm', '-f', v]);
    if (dir !== '') rmSync(dir, { recursive: true, force: true });
  }, 30_000);

  it('removes the stopped dead-owner box and its volume at the start of the next run', async () => {
    expect(await ids()).toHaveLength(1);
    expect(await volumes()).toHaveLength(1);
    resetStaleSweepForTests();
    const { result } = await runPlan([{ command: 'true' }], { original: dir, client });
    expect(result.diagnostics.some((d) => d.name === 'stale-sweep-failed')).toBe(false);
    expect(await ids()).toEqual([]);
    expect(await volumes()).toEqual([]);
  }, 90_000);
});
