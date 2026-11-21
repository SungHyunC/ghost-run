// Feature: ghost-runner, task 14.8: verifyWorld conformance for the Repo_World.
// Validates: Requirements 17.9, 2.1, 2.9
// [docker] Needs the box image; skipped (docker unavailable) otherwise via describeDocker.
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { WardSet, World } from '@ghost-run/core';
import { verifyWorld } from '@ghost-run/core/verify';
import { createRepoWorld } from '../src/world/repo-world.js';
import type { RepoState, ShellAction } from '../src/world/types.js';
import { describeDocker } from './docker-available.js';
import { createFixtureRepo, type FixtureRepo } from './fixtures/repo.js';
import { leftoversOf } from './own-run-ids.js';
import { NUM_RUNS, PBT_MODE, testTimeoutMs } from './pbt-config.js';

const WARDS: WardSet = {
  wards: [
    { id: 'protect-data', kind: 'path', deny: ['delete', 'overwrite'], paths: ['data/'] },
    { id: 'no-exfil', kind: 'egress', secrets: ['.env'], allow_hosts: [] },
  ],
};

// verifyWorld runs 3 + wards.length properties, each over plans of up to 50 Repo_World steps
// (one box exec each), and has no time limit. Keep the run count far below the profile's.
const VERIFY_RUNS = Math.min(NUM_RUNS, PBT_MODE === 'save' ? 2 : PBT_MODE === 'explicit' ? 5 : 20);

// Cheap, always-exit-0 file actions. Paths are relative to the box copy.
const actionArb: fc.Arbitrary<ShellAction> = fc
  .tuple(fc.constantFrom('a', 'b', 'c'), fc.constantFrom('touch', 'echo x >', 'mkdir -p', 'rm -f'))
  .map(([name, op]) => ({ command: `${op} 'scratch-${name}'; true` }));

/**
 * Content fingerprint of a RepoState: relative path, kind, and content bytes (symlink target for
 * links), read from the snapshot directory. Ignores rootPath, timestamps and lastStep, and does not
 * depend on entry order.
 */
function contentFingerprint(s: RepoState): string[] {
  return s.entries
    .map((e) => {
      const abs = join(s.rootPath, e.path);
      let content = '';
      if (lstatSync(abs).isSymbolicLink()) content = readlinkSync(abs);
      else if (e.type === 'file') content = readFileSync(abs).toString('base64');
      return JSON.stringify([e.path, e.type, content]);
    })
    .sort();
}

function repoStateEquals(a: RepoState, b: RepoState): boolean {
  const fa = contentFingerprint(a);
  const fb = contentFingerprint(b);
  return fa.length === fb.length && fa.every((x, i) => x === fb[i]);
}

// Only the run ids that this test process issued count as leftovers (see own-run-ids.ts).
const issued = vi.hoisted(() => new Set<string>());
vi.mock('node:crypto', async (orig) => (await import('./own-run-ids.js')).recordRandomUuid(await orig<typeof import('node:crypto')>(), issued));

describeDocker('verifyWorld on the Repo_World (docker)', () => {
  let fixture: FixtureRepo;
  let world: ReturnType<typeof createRepoWorld>;

  beforeAll(async () => {
    fixture = await createFixtureRepo();
    world = createRepoWorld({ original: fixture.root });
  });

  afterAll(async () => {
    await world.dispose();
    fixture.cleanup();
    expect(issued.size).toBeGreaterThan(0);
    expect(leftoversOf(issued)).toEqual([]);
  });

  it(
    'passes verifyWorld with deterministic:false and a content-based stateEquals',
    async () => {
      expect(world.metadata.deterministic).toBe(false);
      const w: World<RepoState, ShellAction> = world;
      await verifyWorld(w, {
        id: 'repo',
        deterministic: false,
        wardSet: WARDS,
        numRuns: VERIFY_RUNS,
        actionArb,
        stateEquals: repoStateEquals,
      });
    },
    PBT_MODE === 'save' ? testTimeoutMs(true) : 0,
  );
});
