import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AVAILABILITY_LIMIT_MS, AVAILABILITY_WAKE_LIMIT_MS, boxImageTag, checkDockerAvailability, computeBoxHash } from '../src/docker/availability.js';
import type { DockerCallOptions, DockerClient, DockerResult } from '../src/docker/cli.js';
import { FakeClock } from './fixtures/fake-docker.js';

const BUILD_MJS = new URL('../box/build.mjs', import.meta.url);
const created: string[] = [];

function makeBoxDir(recorder: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ghost-box-test-'));
  created.push(dir);
  writeFileSync(join(dir, 'Dockerfile'), 'FROM node@sha256:abc\nRUN true\n');
  writeFileSync(join(dir, 'BASE_DIGEST'), `sha256:${'a'.repeat(64)}\n`);
  mkdirSync(join(dir, 'recorder', 'sub'), { recursive: true });
  for (const [name, body] of Object.entries(recorder)) writeFileSync(join(dir, 'recorder', name), body);
  return dir;
}

afterEach(() => {
  for (const d of created.splice(0)) rmSync(d, { recursive: true, force: true });
});

const ID = `sha256:${'b'.repeat(64)}`;

function res(p: Partial<DockerResult>): DockerResult {
  return { code: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: false, ...p };
}

function inspectJson(hash: string | undefined, env: string[] = []): string {
  return JSON.stringify([{ Id: ID, Config: { Labels: hash === undefined ? {} : { 'ghost-run.box.hash': hash }, Env: env } }]);
}

function scripted(result: DockerResult | ((opts: DockerCallOptions | undefined) => DockerResult)): DockerClient & { calls: (readonly string[])[]; opts: (DockerCallOptions | undefined)[] } {
  const calls: (readonly string[])[] = [];
  const opts: (DockerCallOptions | undefined)[] = [];
  return {
    calls,
    opts,
    run(args, o) {
      calls.push(args);
      opts.push(o);
      return Promise.resolve(typeof result === 'function' ? result(o) : result);
    },
  };
}

describe('computeBoxHash', () => {
  it('matches box/build.mjs on a fixture directory, including nested files and .gitkeep', async () => {
    const dir = makeBoxDir({ 'a.mjs': 'one', '.gitkeep': '' });
    writeFileSync(join(dir, 'recorder', 'sub', 'b.mjs'), 'two\n');
    writeFileSync(join(dir, 'build.mjs'), await (await import('node:fs/promises')).readFile(BUILD_MJS));
    const mod = (await import(/* @vite-ignore */ pathToFileURL(join(dir, 'build.mjs')).href)) as { computeBoxHash(): string };
    const expected = mod.computeBoxHash();
    expect(computeBoxHash(dir)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a recorder file changes', () => {
    const dir = makeBoxDir({ 'a.mjs': 'one' });
    const before = computeBoxHash(dir);
    writeFileSync(join(dir, 'recorder', 'a.mjs'), 'two');
    expect(computeBoxHash(dir)).not.toBe(before);
  });
});

describe('checkDockerAvailability', () => {
  it('is available when the label matches the computed hash, and returns the image id and image env', async () => {
    const dir = makeBoxDir({ 'a.mjs': 'x' });
    const hash = computeBoxHash(dir);
    const client = scripted(res({ stdout: Buffer.from(inspectJson(hash, ['PATH=/x', 'NODE_VERSION=20', 'CI=true'])) }));
    const r = await checkDockerAvailability(client, { boxDir: dir });
    expect(r).toEqual({ available: true, imageRef: ID, imageId: ID, tag: boxImageTag(hash), imageEnv: ['NODE_VERSION=20'], wakeRetried: false });
    expect(client.calls[0]).toEqual(['image', 'inspect', boxImageTag(hash)]);
    expect(client.opts[0]?.timeoutMs).toBe(AVAILABILITY_LIMIT_MS);
  });

  it('reports box-image-missing when the label differs or is absent', async () => {
    const dir = makeBoxDir({});
    for (const label of ['0'.repeat(64), undefined]) {
      const r = await checkDockerAvailability(scripted(res({ stdout: Buffer.from(inspectJson(label)) })), { boxDir: dir });
      expect(r).toMatchObject({ available: false, reason: 'box-image-missing' });
    }
  });

  it('reports box-image-missing when docker says there is no such image', async () => {
    const r = await checkDockerAvailability(
      scripted(res({ code: 1, stderr: Buffer.from('Error response from daemon: No such image: ghost-run/box:x') })),
      { boxDir: makeBoxDir({}) },
    );
    expect(r).toMatchObject({ available: false, reason: 'box-image-missing' });
  });

  it('reports box-image-missing when the box sources cannot be read', async () => {
    const r = await checkDockerAvailability(scripted(res({})), { boxDir: join(tmpdir(), 'ghost-no-such-box-dir') });
    expect(r).toMatchObject({ available: false, reason: 'box-image-missing' });
  });

  it('reports docker-unavailable for an unreachable daemon, a missing docker binary, and a timeout', async () => {
    const dir = makeBoxDir({});
    const cases = [
      res({ code: 1, stderr: Buffer.from('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?') }),
      res({ code: null, spawnError: 'spawn docker ENOENT' }),
      res({ code: null, timedOut: true }),
    ];
    for (const c of cases) {
      expect(await checkDockerAvailability(scripted(c), { boxDir: dir })).toMatchObject({ available: false, reason: 'docker-unavailable' });
    }
  });

  it('bounds the call by the 2.0 s limit even when the client would allow more', async () => {
    const clock = new FakeClock();
    const client = scripted((o) => (o?.timeoutMs === 2000 && o.deadlineAt === clock.now() + 2000 ? res({ code: null, timedOut: true }) : res({})));
    const r = await checkDockerAvailability(client, { boxDir: makeBoxDir({}), clock });
    expect(r).toMatchObject({ available: false, reason: 'docker-unavailable' });
  });

  it('accepts a pinned digest reference without the label check', async () => {
    const ref = `registry.example/ghost-box@sha256:${'c'.repeat(64)}`;
    const client = scripted(res({ stdout: Buffer.from(inspectJson(undefined)) }));
    const r = await checkDockerAvailability(client, { image: ref });
    expect(r).toMatchObject({ available: true, imageRef: ref, imageId: ID });
    expect(client.calls[0]).toEqual(['image', 'inspect', ref]);
  });

  describe('wake retry (Req 3.8)', () => {
    const timeout = res({ code: null, timedOut: true });
    const good = (hash: string): DockerResult => res({ stdout: Buffer.from(inspectJson(hash)) });

    it('uses 2 s and 10 s as the two deadlines', () => {
      expect(AVAILABILITY_LIMIT_MS).toBe(2000);
      expect(AVAILABILITY_WAKE_LIMIT_MS).toBe(10_000);
    });

    it('does not retry unless asked to', async () => {
      const client = scripted(timeout);
      const r = await checkDockerAvailability(client, { boxDir: makeBoxDir({}) });
      expect(r).toMatchObject({ available: false, wakeRetried: false });
      expect(client.calls).toHaveLength(1);
    });

    it('a fast first check never retries', async () => {
      const dir = makeBoxDir({});
      const client = scripted(good(computeBoxHash(dir)));
      const r = await checkDockerAvailability(client, { boxDir: dir, wakeRetryLimitMs: AVAILABILITY_WAKE_LIMIT_MS });
      expect(r).toMatchObject({ available: true, wakeRetried: false });
      expect(client.calls).toHaveLength(1);
    });

    it('a slow first check and a fast retry succeed, with the retry on the long deadline', async () => {
      const dir = makeBoxDir({});
      const clock = new FakeClock();
      let n = 0;
      const client = scripted(() => (n++ === 0 ? timeout : good(computeBoxHash(dir))));
      const r = await checkDockerAvailability(client, { boxDir: dir, clock, wakeRetryLimitMs: AVAILABILITY_WAKE_LIMIT_MS });
      expect(r).toMatchObject({ available: true, wakeRetried: true });
      expect(client.opts.map((o) => o?.timeoutMs)).toEqual([2000, 10_000]);
    });

    it('a timeout past both deadlines is unavailable', async () => {
      const client = scripted(timeout);
      const r = await checkDockerAvailability(client, { boxDir: makeBoxDir({}), wakeRetryLimitMs: AVAILABILITY_WAKE_LIMIT_MS });
      expect(r).toMatchObject({ available: false, reason: 'docker-unavailable', wakeRetried: true });
      expect(client.calls).toHaveLength(2);
    });

    it('an unreachable daemon or a missing binary is not retried', async () => {
      for (const c of [res({ code: 1, stderr: Buffer.from('Cannot connect to the Docker daemon') }), res({ code: null, spawnError: 'spawn docker ENOENT' })]) {
        const client = scripted(c);
        const r = await checkDockerAvailability(client, { boxDir: makeBoxDir({}), wakeRetryLimitMs: AVAILABILITY_WAKE_LIMIT_MS });
        expect(r).toMatchObject({ available: false, reason: 'docker-unavailable', wakeRetried: false });
        expect(client.calls).toHaveLength(1);
      }
    });

    it('caps the retry by the pipeline deadline', async () => {
      const clock = new FakeClock();
      const client = scripted(timeout);
      await checkDockerAvailability(client, {
        boxDir: makeBoxDir({}),
        clock,
        wakeRetryLimitMs: AVAILABILITY_WAKE_LIMIT_MS,
        deadlineAt: clock.now() + 5000,
      });
      expect(client.opts.map((o) => o?.timeoutMs)).toEqual([2000, 5000]);
    });

    it('skips the retry when no pipeline time is left', async () => {
      const clock = new FakeClock();
      const client = scripted(timeout);
      const r = await checkDockerAvailability(client, { boxDir: makeBoxDir({}), clock, wakeRetryLimitMs: 10_000, deadlineAt: clock.now() });
      expect(r).toMatchObject({ available: false, wakeRetried: false });
      expect(client.calls).toHaveLength(1);
    });
  });
});
