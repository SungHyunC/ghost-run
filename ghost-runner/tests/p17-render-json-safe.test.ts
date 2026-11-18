// Feature: ghost-runner, Property 17: Render is JSON-safe
// Validates: Requirements 2.6
import type { Snapshot } from '@ghost-run/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ManifestEntry } from '../src/fs/manifest.js';
import { renderRepoTree } from '../src/world/render.js';
import type { RepoState } from '../src/world/types.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

let executed = 0;

const entryArb: fc.Arbitrary<ManifestEntry> = fc.record(
  {
    path: fc.oneof(
      fc.string({ unit: 'binary', minLength: 1, maxLength: 24 }),
      fc.constantFrom('__proto__', 'a/b', 'a/b/c.txt', 'ü/ß', 'toString', '.hidden'),
    ),
    type: fc.constantFrom('file', 'dir', 'symlink', 'other'),
    size: fc.oneof(fc.constant(0), fc.nat(), fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER })),
    mode: fc.integer({ min: 0, max: 0o7777 }),
    mtimeNs: fc.bigInt({ min: 0n, max: 2n ** 63n }).map(String),
    ctimeNs: fc.bigInt({ min: 0n, max: 2n ** 63n }).map(String),
    target: fc.string({ unit: 'binary', maxLength: 12 }),
    hash: fc.string({
      unit: fc.constantFrom(...'0123456789abcdef'),
      minLength: 64,
      maxLength: 64,
    }),
  },
  { requiredKeys: ['path', 'type', 'size', 'mode', 'mtimeNs', 'ctimeNs'] },
);

const repoStateArb: fc.Arbitrary<RepoState> = fc
  .uniqueArray(entryArb, { selector: (e) => e.path, maxLength: 30 })
  .map((entries) => ({ rootPath: '/copy', entries, sqlite: {} }));

const snapshotOf = (state: RepoState): Snapshot<RepoState> => ({
  id: 's',
  state,
  result: { success: true },
});

describe('Property 17: Render is JSON-safe', () => {
  it('JSON round trip equals the scene, and every entry is listed with path, type and size', () => {
    fc.assert(
      fc.property(repoStateArb, (state) => {
        executed++;
        const scene = renderRepoTree(snapshotOf(state));
        expect(JSON.parse(JSON.stringify(scene))).toStrictEqual(scene);

        const listed = (scene as { entries: Array<{ path: string; type: string; size: number }> })
          .entries;
        expect(listed).toHaveLength(state.entries.length);
        const byPath = new Map(listed.map((e) => [e.path, e]));
        for (const e of state.entries) {
          expect(byPath.get(e.path)).toStrictEqual({ path: e.path, type: e.type, size: e.size });
        }
      }),
      pbtParams(false),
    );
    console.log(`Property 17: runs executed=${executed} (mode=${PBT_MODE}, NUM_RUNS=${NUM_RUNS})`);
  }, testTimeoutMs(false));
});
