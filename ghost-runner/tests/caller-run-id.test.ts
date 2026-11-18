// Caller-chosen runId (Req 16.3, 16.5, 16.6). [no-docker] fake Docker client only.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeRunContainers } from '../src/docker/box.js';
import type { DockerCallOptions, DockerClient, DockerResult } from '../src/docker/cli.js';
import { containerName } from '../src/docker/hardening.js';
import { ConfigError } from '../src/errors.js';
import { runPlan } from '../src/pipeline.js';
import { cleanRecorderFiles, createFakeDocker, type FakeDocker } from './fixtures/fake-docker.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMAGE = 'ghost-run/box:test';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'ghost-runid-'));
  dirs.push(root);
  writeFileSync(join(root, 'seed.txt'), 'seed\n');
  return root;
}

async function seed(fake: FakeDocker, runId: string, stop: boolean): Promise<void> {
  await fake.run(['run', '-d', '--name', containerName(runId), '--label', `ghost-run.run-id=${runId}`, IMAGE]);
  if (stop) await fake.run(['stop', containerName(runId)]);
}

const rmCalls = (fake: FakeDocker): (readonly string[])[] => fake.calls.filter((c) => c.args[0] === 'rm').map((c) => c.args);

describe('caller-chosen runId', () => {
  it('uses a random UUID when absent', async () => {
    const fake = createFakeDocker({ recorder: { files: cleanRecorderFiles(1) } });
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client: fake });
    expect(result.runId).toMatch(UUID_RE);
  });

  it('carries the given id into RunResult, the label, and the container name', async () => {
    const fake = createFakeDocker({ recorder: { files: cleanRecorderFiles(1) } });
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client: fake, runId: 'my-run_01' });
    expect(result.runId).toBe('my-run_01');
    const run = fake.callsFor('create')[0]?.args ?? [];
    expect(run).toContain('ghost-my-run_01');
    expect(run).toContain('ghost-run.run-id=my-run_01');
    expect(fake.leakedRunIds()).toEqual([]);
  });

  it('rejects a malformed id with ConfigError before any docker call', async () => {
    const fake = createFakeDocker();
    const err = await runPlan([{ command: 'true' }], { original: repo(), client: fake, runId: 'bad id/..' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).option).toBe('runId');
    expect(fake.calls).toEqual([]);
  });

  it.each([false, true])('duplicate id (stopped=%s) throws ConfigError and leaves the existing container alone', async (stopped) => {
    const fake = createFakeDocker({ recorder: { files: cleanRecorderFiles(1) } });
    await seed(fake, 'dup-1', stopped);
    const err = await runPlan([{ command: 'true' }], { original: repo(), client: fake, runId: 'dup-1' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).option).toBe('runId');
    expect(fake.containersFor('dup-1')).toHaveLength(1);
    expect(fake.callsFor('create')).toHaveLength(1); // only the seed
    expect(rmCalls(fake)).toEqual([]);
  });

  it('records a diagnostic and goes on when the duplicate check itself fails', async () => {
    const fake = createFakeDocker({ recorder: { files: cleanRecorderFiles(1) } });
    const client: DockerClient = {
      run(args: readonly string[], o?: DockerCallOptions): Promise<DockerResult> {
        if (args[0] === 'ps' && args.some((a) => a === 'label=ghost-run.run-id=chk-1')) {
          return Promise.resolve({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: true });
        }
        return fake.run(args, o);
      },
    };
    const { result } = await runPlan([{ command: 'true' }], { original: repo(), client, clock: fake.clock, runId: 'chk-1' });
    expect(result.runId).toBe('chk-1');
    expect(result.diagnostics.some((d) => d.name === 'run-id-check-failed')).toBe(true);
    expect(fake.leakedRunIds()).toEqual([]);
  });

  it('a watchdog can remove a hung run by label', async () => {
    const fake = createFakeDocker({ recorder: { files: cleanRecorderFiles(1) } });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started!: () => void;
    const execStarted = new Promise<void>((r) => (started = r));
    const client: DockerClient = {
      async run(args: readonly string[], o?: DockerCallOptions): Promise<DockerResult> {
        if (args[0] === 'exec' && args.includes('ghost-step')) {
          started();
          await gate;
        }
        return fake.run(args, o);
      },
    };
    const ac = new AbortController();
    const p = runPlan([{ command: 'sleep 100' }], { original: repo(), client, clock: fake.clock, signal: ac.signal, runId: 'hang-1' });
    const settled = p.then(() => 'resolved', (e: unknown) => e);
    await execStarted;
    expect(fake.containersFor('hang-1')).toHaveLength(1);

    expect(await removeRunContainers(fake, 'hang-1')).toEqual({ ok: true });
    expect(fake.leakedRunIds()).toEqual([]);

    ac.abort();
    await settled;
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(fake.leakedRunIds()).toEqual([]);
  });
});
