// [no-docker] Box folder lookup order: boxDir option, GHOST_RUN_BOX_DIR, module location, workspace.
// A folder without a Dockerfile ends in the box-image-missing path.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BOX_DIR_ENV, checkDockerAvailability, findBoxDir, resolveBoxDir } from '../src/docker/availability.js';
import { resolveRunnerOptions, ConfigError } from '../src/index.js';
import type { DockerClient } from '../src/docker/cli.js';

const created: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'ghost-boxdir-test-'));
  created.push(d);
  return d;
}

function makeBox(parent: string, ...segments: string[]): string {
  const dir = join(parent, ...segments);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'Dockerfile'), 'FROM scratch\n');
  writeFileSync(join(dir, 'BASE_DIGEST'), `sha256:${'a'.repeat(64)}\n`);
  return dir;
}

afterEach(() => {
  for (const d of created.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('findBoxDir order', () => {
  it('prefers the boxDir option over the environment, the module, and the workspace', () => {
    const a = makeBox(tmp(), 'a');
    const b = makeBox(tmp(), 'b');
    expect(findBoxDir({ boxDir: a, env: { [BOX_DIR_ENV]: b } })).toBe(a);
  });

  it('uses GHOST_RUN_BOX_DIR when no option is given, and ignores an empty value', () => {
    const b = makeBox(tmp(), 'b');
    const modRoot = tmp();
    const mod = makeBox(modRoot, 'box');
    expect(findBoxDir({ env: { [BOX_DIR_ENV]: b }, moduleDir: join(modRoot, 'x') })).toBe(b);
    expect(findBoxDir({ env: { [BOX_DIR_ENV]: '' }, moduleDir: join(modRoot, 'x') })).toBe(mod);
  });

  it('searches upward from the module before the workspace', () => {
    const modRoot = tmp();
    const mod = makeBox(modRoot, 'box');
    mkdirSync(join(modRoot, 'src', 'docker'), { recursive: true });
    const ws = tmp();
    makeBox(ws, 'box');
    expect(findBoxDir({ moduleDir: join(modRoot, 'src', 'docker'), workspace: ws })).toBe(mod);
  });

  it('falls back to the workspace and searches upward from a subfolder, ghost-runner/box first', () => {
    const empty = tmp();
    const ws = tmp();
    const nested = makeBox(ws, 'ghost-runner', 'box');
    makeBox(ws, 'box');
    mkdirSync(join(ws, 'apps', 'x'), { recursive: true });
    expect(findBoxDir({ moduleDir: empty, workspace: join(ws, 'apps', 'x') })).toBe(nested);
  });

  it('finds a plain box/ in the workspace', () => {
    const ws = tmp();
    const plain = makeBox(ws, 'box');
    expect(findBoxDir({ moduleDir: tmp(), workspace: ws })).toBe(plain);
  });

  it('returns undefined when nothing is found, and resolveBoxDir throws', () => {
    expect(findBoxDir({ moduleDir: tmp(), workspace: tmp() })).toBeUndefined();
    expect(() => resolveBoxDir({ moduleDir: tmp(), workspace: tmp() })).toThrow('box/ directory not found');
  });
});

describe('box folder without a Dockerfile', () => {
  const noDocker: DockerClient = {
    run: () => Promise.reject(new Error('docker must not be called')),
  } as unknown as DockerClient;

  it('gives box-image-missing for an explicit boxDir, without a Docker call', async () => {
    const r = await checkDockerAvailability(noDocker, { boxDir: tmp() });
    expect(r).toMatchObject({ available: false, reason: 'box-image-missing' });
  });

  it('gives box-image-missing for a GHOST_RUN_BOX_DIR without a Dockerfile', async () => {
    const r = await checkDockerAvailability(noDocker, { env: { [BOX_DIR_ENV]: tmp() } });
    expect(r).toMatchObject({ available: false, reason: 'box-image-missing' });
  });

  it('gives box-image-missing when no folder is found anywhere', async () => {
    const r = await checkDockerAvailability(noDocker, { moduleDir: tmp(), workspace: tmp() });
    expect(r).toMatchObject({ available: false, reason: 'box-image-missing' });
  });
});

describe('RunnerOptions.boxDir', () => {
  it('is carried into the resolved options and rejects an empty string', () => {
    const original = tmp();
    expect(resolveRunnerOptions({ original, boxDir: '/x/box' }).boxDir).toBe('/x/box');
    expect(resolveRunnerOptions({ original }).boxDir).toBeUndefined();
    expect(() => resolveRunnerOptions({ original, boxDir: '' })).toThrow(ConfigError);
  });
});
