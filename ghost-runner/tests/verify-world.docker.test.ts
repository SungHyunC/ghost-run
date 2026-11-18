// Feature: ghost-runner, task 14.8: verifyWorld conformance for the Repo_World.
// Validates: Requirements 17.9, 2.1, 2.9
// [docker] Needs the box image; skipped (docker unavailable) otherwise via describeDocker.
import { spawnSync } from 'node:child_process';
import fc from 'fast-check';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { WardSet, World } from '@ghost-run/core';
import { verifyWorld, VerificationError } from '@ghost-run/core/verify';
import { createRepoWorld } from '../src/world/repo-world.js';
import type { RepoState, ShellAction } from '../src/world/types.js';
import { describeDocker } from './docker-available.js';
import { createFixtureRepo, type FixtureRepo } from './fixtures/repo.js';
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

function ghostLeftovers(): string[] {
  const out: string[] = [];
  for (const args of [
    ['ps', '-a', '-q'],
    ['volume', 'ls', '-q'],
  ]) {
    const r = spawnSync('docker', [...args, '--filter', 'label=ghost-run.run-id'], { encoding: 'utf8' });
    out.push(...r.stdout.split('\n').filter((l) => l.trim() !== ''));
  }
  return out;
}

describeDocker('verifyWorld on the Repo_World (docker)', () => {
  let fixture: FixtureRepo;
  let world: ReturnType<typeof createRepoWorld>;
  const before = new Set<string>();

  beforeAll(async () => {
    for (const id of ghostLeftovers()) before.add(id);
    fixture = await createFixtureRepo();
    world = createRepoWorld({ original: fixture.root });
  });

  afterAll(async () => {
    await world.dispose();
    fixture.cleanup();
    expect(ghostLeftovers().filter((id) => !before.has(id))).toEqual([]);
  });

  // KNOWN CORE LIMITATION (core/verify.ts, P3 criterion 10.2): verifyWorld compares the final
  // `state` of two replays with deepEqual. A RepoState carries a per-step `rootPath`, per-file
  // mtimeNs/ctimeNs and `lastStep`, so two replays can never be deep-equal. Fixing it needs core to
  // compare replays through `world.diff` or to accept a state-equality option. core/ is not edited
  // by this spec. `it.fails` keeps the suite green now and turns red once core is fixed, which is
  // the signal to replace it.fails with a plain `it`. Everything verifyWorld would check for this
  // world is covered by repo-world-conformance.docker.test.ts.
  let captured: unknown;
  it.fails(
    'passes verifyWorld with deterministic:false (EXPECTED FAILURE: core P3 10.2 deepEqual on state)',
    async () => {
      expect(world.metadata.deterministic).toBe(false);
      const w: World<RepoState, ShellAction> = world;
      try {
        // numRuns 1: the failure is deterministic, and every shrink step costs box executions.
        await verifyWorld(w, { id: 'repo', deterministic: false, wardSet: WARDS, numRuns: 1, actionArb });
      } catch (e) {
        captured = e;
        throw e;
      }
    },
    PBT_MODE === 'save' ? testTimeoutMs(true) : 0,
  );

  it('the expected verifyWorld failure is the P3 10.2 replay failure and nothing else', () => {
    expect(captured, 'verifyWorld resolved: core is fixed, replace it.fails with it').toBeInstanceOf(
      VerificationError,
    );
    const err = captured as VerificationError;
    expect(err.propertyId).toBe('P3');
    expect(err.criterionId).toBe('10.2');
    expect(err.message).toBe('Verification failed: P3 (10.2)');
  });
});
