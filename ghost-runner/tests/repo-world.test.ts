// [no-docker] Repo_World contract, render, diff, snapshot, dispose, and failure handling.
// Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import type { Snapshot, World } from '@ghost-run/core';
import type { DockerClient } from '../src/docker/cli.js';
import { createRepoWorld } from '../src/world/repo-world.js';
import { renderRepoTree } from '../src/world/render.js';
import type { RepoState, ShellAction } from '../src/world/types.js';

const noDocker: DockerClient = {
  run: () =>
    Promise.resolve({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: false, spawnError: 'ENOENT' }),
};

const dirs: string[] = [];
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'ghost-rw-'));
  dirs.push(root);
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'data', 'a.txt'), 'a\n');
  writeFileSync(join(root, 'b.txt'), 'bb\n');
  return root;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function snap(entries: RepoState['entries']): Snapshot<RepoState> {
  return { id: 's', state: { rootPath: '/x', entries, sqlite: {} }, result: { success: true } };
}
const file = (path: string, size: number, hash: string): RepoState['entries'][number] => ({
  path, type: 'file', size, mode: 0o644, mtimeNs: '1', ctimeNs: '1', hash,
});

describe('Repo_World', () => {
  it('is a core World<RepoState, ShellAction> with deterministic: false', () => {
    const world = createRepoWorld({ original: repo(), client: noDocker });
    const w: World<RepoState, ShellAction> = world;
    expect(w).toBe(world);
    expect(world.metadata).toEqual({ id: 'repo', deterministic: false });
  });

  it('snapshot() copies Original, leaves it unchanged, carries Original hashes, and dispose() removes the Copy', async () => {
    const root = repo();
    const world = createRepoWorld({ original: root, client: noDocker });
    const before = await world.fingerprint();
    const s = await world.snapshot();
    const after = await world.fingerprint();
    expect(after.hash).toBe(before.hash);
    expect(s.result).toEqual({ success: true });
    expect(existsSync(s.state.rootPath)).toBe(true);
    expect(s.state.rootPath).not.toBe(root);
    for (const e of s.state.entries) {
      if (e.type === 'file') expect(e.hash).toBe(before.manifest[e.path]);
    }
    await world.dispose();
    expect(existsSync(s.state.rootPath)).toBe(false);
    expect(existsSync(`${s.state.rootPath}.sentinel`)).toBe(false);
  });

  it('step() returns success:false with an error text, does not throw, and leaves the input directory alone when Docker is unavailable', async () => {
    const world = createRepoWorld({ original: repo(), client: noDocker });
    const s = await world.snapshot();
    const fpBefore = JSON.stringify(s.state.entries);
    const next = await world.step(s, { command: 'rm -rf data' });
    expect(next.result.success).toBe(false);
    if (!next.result.success) expect(next.result.error.length).toBeGreaterThan(0);
    expect(next.state.rootPath).not.toBe(s.state.rootPath);
    expect(next.state.lastStep?.outcome).toBe('error');
    expect(existsSync(join(s.state.rootPath, 'data', 'a.txt'))).toBe(true);
    expect(JSON.stringify(s.state.entries)).toBe(fpBefore);
    expect(world.diff(s, next)).toEqual([]);
    await world.dispose();
    expect(existsSync(next.state.rootPath)).toBe(false);
  });

  it('step() throws only for a malformed action', async () => {
    const world = createRepoWorld({ original: repo(), client: noDocker });
    const s = await world.snapshot();
    await expect(world.step(s, { command: 42 } as unknown as ShellAction)).rejects.toThrow(TypeError);
    await world.dispose();
  });

  it('diff() is pure and reports deleted and overwritten files', () => {
    const world = createRepoWorld({ original: repo(), client: noDocker });
    const a = snap([file('data/a.txt', 2, 'h1'), file('b.txt', 3, 'h2')]);
    const b = snap([file('b.txt', 9, 'h3'), file('c.txt', 1, 'h4')]);
    const frozen = JSON.stringify([a, b]);
    expect(world.diff(a, b)).toEqual([
      { kind: 'file-overwritten', path: 'b.txt', sizeBefore: 3, sizeAfter: 9 },
      { kind: 'file-created', path: 'c.txt', entryType: 'file' },
      { kind: 'file-deleted', path: 'data/a.txt', entryType: 'file' },
    ]);
    expect(JSON.stringify([a, b])).toBe(frozen);
  });

  it('effectsOutside() reports external destinations and nothing for a local command', () => {
    const world = createRepoWorld({ original: repo(), client: noDocker });
    expect(world.effectsOutside({ command: 'curl https://setup-check.example/x' })).toEqual([
      { kind: 'url', destination: 'https://setup-check.example/x' },
    ]);
    expect(world.effectsOutside({ command: 'rm -rf data' })).toEqual([]);
  });
});

describe('render', () => {
  it('returns repo-tree entries sorted by path, JSON round-trip safe', () => {
    const s = snap([file('b.txt', 2, 'x'), { ...file('a', 0, ''), type: 'dir' }, file('a/z', 1, 'y')]);
    const scene = renderRepoTree(s);
    expect(scene).toEqual({
      kind: 'repo-tree',
      entries: [
        { path: 'a', type: 'dir', size: 0 },
        { path: 'a/z', type: 'file', size: 1 },
        { path: 'b.txt', type: 'file', size: 2 },
      ],
    });
    expect(JSON.parse(JSON.stringify(scene))).toEqual(scene);
  });

  it('is order-independent and JSON-safe for arbitrary entries', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ maxLength: 12 }), { maxLength: 20 }),
        fc.constantFrom('file', 'dir', 'symlink', 'other'),
        (paths, type) => {
          const entries = paths.map((p, i) => ({ ...file(p, i, 'h'), type }));
          const scene = renderRepoTree(snap(entries));
          expect(JSON.parse(JSON.stringify(scene))).toEqual(scene);
          expect(renderRepoTree(snap([...entries].reverse()))).toEqual(scene);
        },
      ),
      { numRuns: 50 },
    );
  });
});
