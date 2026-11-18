import fc from 'fast-check';
import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FILE_TIMEOUT_MS, NUM_RUNS, numRunsFor, pbtMode } from './pbt-config.mjs';
import { canaryArb, makeMemFsView, makeTempStore, shellEvent } from './fixtures/index.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('pbt-config', () => {
  it('uses 100 runs by default and 10000 in nightly mode', () => {
    expect(numRunsFor({})).toBe(100);
    expect(numRunsFor({ GHOST_PBT_MODE: 'short' })).toBe(100);
    expect(numRunsFor({ GHOST_PBT_MODE: 'nightly' })).toBe(10_000);
    expect(pbtMode({ GHOST_PBT_MODE: 'nightly' })).toBe('nightly');
    expect(NUM_RUNS).toBe(numRunsFor(process.env));
    expect(FILE_TIMEOUT_MS).toBe(60_000);
  });
});

describe('makeTempStore', () => {
  it('creates a folder outside the repository and removes it on cleanup', () => {
    const store = makeTempStore();
    expect(existsSync(store.dir)).toBe(true);
    const rel = relative(repoRoot, store.dir);
    expect(rel.startsWith('..')).toBe(true);
    store.cleanup();
    expect(existsSync(store.dir)).toBe(false);
  });
});

describe('fixtures', () => {
  it('canary arbitrary yields sk-CANARY- plus [A-Za-z0-9_-]', () => {
    fc.assert(
      fc.property(canaryArb, (c) => /^sk-CANARY-[A-Za-z0-9_-]+$/.test(c)),
      { numRuns: NUM_RUNS },
    );
  });

  it('builds a Hook_Event and an in-memory FsView', async () => {
    const ev = shellEvent('ls');
    expect(ev.hook_event_name).toBe('PreToolUse');
    expect(ev.tool_input).toEqual({ command: 'ls' });
    const fsv = makeMemFsView({
      '/r/a': { type: 'file' },
      '/r/link': { type: 'symlink', target: '/r/a' },
    });
    expect(await fsv.realpath('/r/link')).toBe('/r/a');
    expect(await fsv.lstat('/r/missing')).toBeNull();
    expect(await fsv.readdir('/r')).toEqual(['a', 'link']);
  });
});
