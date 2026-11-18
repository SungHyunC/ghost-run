// Feature: ghost-runner, task 14.8: what verifyWorld checks, minus the replay deepEqual on state.
// Validates: Requirements 17.9, 2.1, 2.9
// [docker] Needs the box image; skipped (docker unavailable) otherwise via describeDocker.
// core's verifyWorld cannot pass for the Repo_World (see verify-world.docker.test.ts). This file
// checks the same properties through the world's own diff and directory listings:
// P3 10.1 (input snapshot untouched), P3 10.2 (replays agree via diff and listing), P1 (fingerprint
// unchanged) and the ward checks of 11.1 (deterministic, valid ward ids, monotonic).
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { WardEngine, ghostRun, isMoreRestrictive } from '@ghost-run/core';
import type { WardSet } from '@ghost-run/core';
import { createRepoWorld } from '../src/world/repo-world.js';
import type { ShellAction } from '../src/world/types.js';
import { describeDocker } from './docker-available.js';
import { createFixtureRepo, type FixtureRepo } from './fixtures/repo.js';

const WARDS: WardSet = {
  wards: [
    { id: 'protect-data', kind: 'path', deny: ['delete', 'overwrite'], paths: ['data/'] },
    { id: 'no-exfil', kind: 'egress', secrets: ['.env'], allow_hosts: [] },
  ],
};

/** Structural listing: path -> type, size, content hash or link target. Never follows links. */
function listing(root: string): string[] {
  const out: string[] = [];
  const rec = (abs: string, rel: string): void => {
    for (const name of readdirSync(abs).sort()) {
      const p = join(abs, name);
      const r = rel === '' ? name : `${rel}/${name}`;
      const st = lstatSync(p);
      if (st.isSymbolicLink()) out.push(`${r}\tlink\t${readlinkSync(p)}`);
      else if (st.isDirectory()) {
        out.push(`${r}\tdir`);
        rec(p, r);
      } else if (st.isFile()) {
        const h = createHash('sha256').update(readFileSync(p)).digest('hex');
        out.push(`${r}\tfile\t${String(st.size)}\t${h}`);
      }
    }
  };
  rec(root, '');
  return out;
}

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

const BENIGN: ShellAction[] = [{ command: "touch 'scratch-a'; true" }, { command: "echo x > 'scratch-b'; true" }];
const DELETES_PROTECTED: ShellAction[] = [{ command: "rm -f 'data/seed.txt'; true" }];

describeDocker('Repo_World conformance, verifyWorld checks without state deepEqual (docker)', () => {
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

  it('P1 and P3: ghost runs leave reality and the start snapshot untouched, and replays agree via diff', async () => {
    const originalListing = listing(fixture.root);
    const fpBefore = await world.fingerprint();
    const s0 = await world.snapshot();
    const stateBefore = structuredClone(s0.state);
    const s0Listing = listing(s0.state.rootPath);

    const r1 = await ghostRun(world, s0, BENIGN);
    const r2 = await ghostRun(world, s0, BENIGN);

    // P3 10.1: the start snapshot is unchanged (state and directory).
    expect(s0.state).toEqual(stateBefore);
    expect(listing(s0.state.rootPath)).toEqual(s0Listing);
    // P3 10.2, compared through diff and directory listing instead of state.
    expect(r2.changes).toEqual(r1.changes);
    expect(r1.changes.flat().length).toBeGreaterThan(0);
    const last = (r: typeof r1) => r.snapshots[r.snapshots.length - 1]!;
    expect(listing(last(r2).state.rootPath)).toEqual(listing(last(r1).state.rootPath));
    expect(world.diff(s0, last(r2))).toEqual(world.diff(s0, last(r1)));
    // P1: the original was not touched.
    const fpAfter = await world.fingerprint();
    expect(fpAfter.hash).toBe(fpBefore.hash);
    expect(listing(fixture.root)).toEqual(originalListing);
  }, 120_000);

  it('ward checks: deterministic, valid ward ids, monotonic, and a protected delete blocks', async () => {
    const s0 = await world.snapshot();
    const benign = await ghostRun(world, s0, BENIGN);
    const bad = await ghostRun(world, s0, DELETES_PROTECTED);

    expect(WardEngine.evaluate(benign, WARDS).verdict).toBe('pass');
    const verdict = WardEngine.evaluate(bad, WARDS);
    expect(verdict.verdict).toBe('block');
    expect(verdict.violations.map((v) => v.wardId)).toContain('protect-data');
    expect(WardEngine.evaluate(bad, WARDS)).toEqual(verdict);

    const order = { pass: 0, warn: 1, block: 2 } as const;
    for (const ward of WARDS.wards) {
      const single: WardSet = { wards: [ward] };
      const v1 = WardEngine.evaluate(bad, single);
      expect(WardEngine.evaluate(bad, single)).toEqual(v1);
      expect(v1.violations.every((v) => v.wardId === ward.id)).toBe(true);
      if (isMoreRestrictive(single, WARDS)) {
        expect(order[verdict.verdict]).toBeGreaterThanOrEqual(order[v1.verdict]);
      }
    }
  }, 120_000);
});
