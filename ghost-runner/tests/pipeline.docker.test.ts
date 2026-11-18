// [docker] runPlan against the real box image.
// Validates: Requirements 7.2, 13.4, 14.1, 14.7, 16.4
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { runPlan } from '../src/pipeline.js';
import type { RepoState } from '../src/world/types.js';
import { serializeRunResult } from '../src/result.js';
import { describeDocker } from './docker-available.js';
import { createFixtureRepo, CANARY, USERS_ROWS, type FixtureRepo } from './fixtures/repo.js';

function ghostContainers(runId: string): string[] {
  const r = spawnSync('docker', ['ps', '-a', '-q', '--filter', `label=ghost-run.run-id=${runId}`], { encoding: 'utf8' });
  return r.stdout.split('\n').filter((l) => l.trim() !== '');
}

describeDocker('runPlan in a real box', () => {
  let fixture: FixtureRepo;

  beforeAll(async () => {
    fixture = await createFixtureRepo();
  });
  afterAll(() => {
    fixture.cleanup();
  });

  it('runs a two-action plan, reports Changes, claims P1, and leaves nothing behind', async () => {
    const t0 = Date.now();
    const { result } = await runPlan(
      [{ command: 'rm -rf data' }, { command: 'echo done > build/done.txt' }],
      { original: fixture.root },
    );
    expect(Date.now() - t0).toBeLessThan(60_000);
    expect(result.status).toBe('ok');
    expect(result.exitCodes).toEqual([0, 0]);
    expect(result.report.snapshots).toHaveLength(3);
    expect(result.report.changes[0]).toContainEqual({ kind: 'file-deleted', path: 'data/seed.txt', entryType: 'file' });
    expect(result.report.changes[1]).toContainEqual({ kind: 'file-created', path: 'build/done.txt', entryType: 'file' });
    expect(result.isolation).toMatchObject({ mode: 'docker-box', p1Claimed: true, originalUnchanged: true, mountAuditPassed: true });
    expect(result.verdict).toBe('pass');
    if (fixture.sqlite !== 'placeholder') {
      const state = result.report.snapshots[0]?.state as RepoState | undefined;
      expect(state?.sqlite['app.db']).toEqual({ users: USERS_ROWS });
    }
    expect(existsSync(result.copy.location)).toBe(false);
    // Only this run's containers count; other Docker test files may run concurrently.
    expect(ghostContainers(result.runId)).toEqual([]);
    expect(serializeRunResult(result)).not.toContain(CANARY);
  }, 90_000);
});
