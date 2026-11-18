// [docker] Property 19: P1 for the Docker box (claimed in Docker-box runs, with Docker available).
// Skipped (never passed) when Docker is unavailable; not asserted in Plan B.
// **Validates: Requirements 17.1**
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fc from 'fast-check';
import { expect, it } from 'vitest';
import { fingerprintOriginal } from '../src/fs/fingerprint.js';
import { runPlan } from '../src/pipeline.js';
import type { ShellAction } from '../src/world/types.js';
import { describeDocker, recordDockerExamples } from './docker-available.js';
import { treeArb, materializeTree, type TreeEntry } from './fixtures/arbitraries.js';
import { DOCKER_POOL_SLOTS, NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

const MAX_ACTIONS = 50;

/**
 * Save keeps the shared Docker budget (interrupted runs are labeled partial). Explicit runs
 * are not interrupted, so each of the 100 box runs gets up to 5 s. Nightly has no limit.
 */
const TIMEOUT_MS: number =
  PBT_MODE === 'save' ? testTimeoutMs(true) : PBT_MODE === 'nightly' ? 0 : NUM_RUNS * 5_000 + 30_000;

function ghostContainers(runId: string): string[] {
  const r = spawnSync('docker', ['ps', '-a', '-q', '--filter', `label=ghost-run.run-id=${runId}`], {
    encoding: 'utf8',
  });
  return r.stdout.split('\n').filter((l) => l.trim() !== '');
}

const quoted = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** Fixture actions: file operations, deletes, overwrites, links, escapes, absolute paths, SQLite. */
function actionArb(tree: readonly TreeEntry[], originalPath: string): fc.Arbitrary<ShellAction> {
  const paths = tree.filter((e) => e.kind !== 'dir').map((e) => e.path);
  const target = fc.constantFrom(...(paths.length > 0 ? paths : ['x.txt']));
  const fresh = fc.stringMatching(/^[a-z]{1,6}$/).map((s) => `${s}.new`);
  const text = fc.stringMatching(/^[a-z0-9 ]{0,12}$/);
  const sql = fc.constantFrom(
    'CREATE TABLE IF NOT EXISTS t(a)',
    'INSERT INTO t VALUES (1)',
    'DROP TABLE IF EXISTS t',
    'DELETE FROM t',
  );
  const command = fc.oneof(
    fc.tuple(fresh, text).map(([p, t]) => `echo ${quoted(t)} > ${quoted(p)}`),
    target.map((p) => `rm -rf ${quoted(p)}`),
    fc.tuple(target, text).map(([p, t]) => `echo ${quoted(t)} > ${quoted(p)}`),
    fc.tuple(target, fresh).map(([p, l]) => `ln -s ${quoted(p)} ${quoted(l)}`),
    fc.tuple(target, text).map(([p, t]) => `echo ${quoted(t)} >> ${quoted(p)}`),
    fc.tuple(target, fresh).map(([p, l]) => `ln -sf ${quoted(`${originalPath}/${p}`)} ${quoted(l)}; echo x > ${quoted(l)}`),
    fresh.map((p) => `cd .. && echo escaped > ${quoted(p)}`),
    fresh.map((p) => `cd ../.. && rm -rf ${quoted(p)}`),
    fresh.map((p) => `echo abs > ${quoted(`${originalPath}/${p}`)}`),
    fresh.map((p) => `rm -rf ${quoted(`${originalPath}/${p}`)} /ghost-outside.invalid`),
    sql.map((s) => `sqlite3 app.db ${quoted(s)}`),
  );
  return command.map((c) => ({ command: c }));
}

describeDocker('[docker] P1 for the Docker box (Property 19)', () => {
  it(
    'leaves the Original fingerprint unchanged and claims P1 in every docker-box run',
    async ({ task }) => {
      let completed = 0;
      let dockerRuns = 0;
      try {
        await fc.assert(
          fc.asyncProperty(
            treeArb.chain((tree) =>
              fc.tuple(
                fc.constant(tree),
                fc.array(actionArb(tree, '__ORIG__'), { minLength: 1, maxLength: MAX_ACTIONS }),
              ),
            ),
            async ([tree, plan]) => {
              const fixture = materializeTree(tree);
              try {
                const actions = plan.map((a) => ({ command: a.command.split('__ORIG__').join(fixture.root) }));
                const before = (await fingerprintOriginal(fixture.root)).fingerprint.hash;
                const { result } = await runPlan(actions, {
                  original: fixture.root,
                  pool: { size: DOCKER_POOL_SLOTS },
                });
                const after = (await fingerprintOriginal(fixture.root)).fingerprint.hash;
                // Not asserted in Plan B: only docker-box runs carry the P1 claim.
                if (result.isolation.mode === 'docker-box') {
                  dockerRuns += 1;
                  expect(after).toBe(before);
                  expect(result.isolation.p1Claimed).toBe(true);
                  expect(existsSync(result.copy.location)).toBe(false);
                  expect(ghostContainers(result.runId)).toEqual([]);
                }
              } finally {
                fixture.cleanup();
              }
              completed += 1;
            },
          ),
          pbtParams(true),
        );
      } finally {
        recordDockerExamples(task, completed);
        console.info(`P19: ${String(completed)} examples completed (${String(dockerRuns)} docker-box), target ${String(NUM_RUNS)}`);
      }
      expect(dockerRuns).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );
});
