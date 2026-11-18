// Feature: ghost-runner, Property 22: Pipeline and Repo_World agree
// [docker] A consistency check between two code paths of this package. It is not P2.
// Skipped (docker unavailable) via describeDocker; not asserted in Plan B.
// **Validates: Requirements 14.7**
import { spawnSync } from 'node:child_process';
import { ghostRun } from '@ghost-run/core';
import fc from 'fast-check';
import { afterAll, expect, it } from 'vitest';
import type { DockerClient } from '../src/docker/cli.js';
import { createDockerClient } from '../src/docker/cli.js';
import { runPlan } from '../src/pipeline.js';
import { createRepoWorld } from '../src/world/repo-world.js';
import type { ShellAction } from '../src/world/types.js';
import { describeDocker, recordDockerExamples } from './docker-available.js';
import { materializeTree, treeArb, type TreeEntry } from './fixtures/index.js';
import { DOCKER_POOL_SLOTS, NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

/** Short plans keep the per-example cost low: every step builds a box. */
const MAX_ACTIONS = 2;

/** Save keeps the shared Docker budget. Explicit runs get up to 10 s per example. Nightly is unlimited. */
const TIMEOUT_MS: number =
  PBT_MODE === 'save' ? testTimeoutMs(true) : PBT_MODE === 'nightly' ? 0 : NUM_RUNS * 10_000 + 30_000;

const word = fc.stringMatching(/^[a-z0-9]{1,8}$/);

/** Deterministic file-only actions over paths of the generated tree plus fresh names. Always exit 0. */
function actionArb(tree: readonly TreeEntry[]): fc.Arbitrary<ShellAction> {
  const files = tree.filter((e) => e.kind === 'file').map((e) => e.path);
  const existing = fc.constantFrom(...(files.length > 0 ? files : ['x.txt']));
  const fresh = fc.stringMatching(/^[a-z]{1,5}$/).map((s) => `${s}.new`);
  const target = fc.oneof(existing, fresh);
  const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.');
  const cmd = fc.oneof(
    fc.tuple(target, word).map(([p, c]) => `mkdir -p '${dirOf(p)}'; echo ${c} > '${p}'`),
    fc.tuple(target, word).map(([p, c]) => `mkdir -p '${dirOf(p)}'; echo ${c} >> '${p}'`),
    existing.map((p) => `rm -f '${p}'`),
    target.map((p) => `mkdir -p '${dirOf(p)}'; touch '${p}'`),
    fc.tuple(existing, fresh).map(([a, b]) => `mv '${a}' '${b}'`),
    fc.tuple(existing, fresh).map(([a, b]) => `cp '${a}' '${b}'`),
    fresh.map((d) => `mkdir -p '${d}.d'`),
  );
  return cmd.map((c) => ({ command: `${c}; true` }));
}

function wrapClient(runIds: Set<string>): DockerClient {
  const inner = createDockerClient();
  return {
    run(args, opts) {
      for (const a of args) {
        const m = /^ghost-run\.run-id=(.+)$/.exec(a);
        if (m?.[1] !== undefined) runIds.add(m[1]);
      }
      return inner.run(args, opts);
    },
  };
}

function labeled(kind: 'ps' | 'volume', runId: string): string[] {
  const args = kind === 'ps' ? ['ps', '-a', '-q'] : ['volume', 'ls', '-q'];
  const r = spawnSync('docker', [...args, '--filter', `label=ghost-run.run-id=${runId}`], { encoding: 'utf8' });
  return r.stdout.split('\n').filter((l) => l.trim() !== '');
}

describeDocker('[docker] pipeline and Repo_World agree (Property 22)', () => {
  const runIds = new Set<string>();

  afterAll(() => {
    const leftover: string[] = [];
    for (const id of runIds) leftover.push(...labeled('ps', id), ...labeled('volume', id));
    expect(leftover).toEqual([]);
  }, 300_000);

  it(
    'Property 22: report.changes[0] of runPlan equals the Change[] of ghostRun(repoWorld, snapshot, [action])',
    async ({ task }) => {
      let completed = 0;
      let compared = 0;
      // fast-check's time limit returns while an example may still run; stop it and wait for it.
      let stopped = false;
      let inFlight: Promise<unknown> = Promise.resolve();

      const example = async ([tree, plan]: [TreeEntry[], ShellAction[]]): Promise<void> => {
        if (stopped) return;
        const fixture = materializeTree(tree);
        const world = createRepoWorld({ original: fixture.root, client: wrapClient(runIds) });
        try {
          // Any single fixture action: check each action of the short plan on its own.
          for (const action of plan) {
            if (stopped) return;
            const { result } = await runPlan([action], {
              original: fixture.root,
              pool: { size: DOCKER_POOL_SLOTS },
            });
            runIds.add(result.runId);
            // Plan B has no box diff; the agreement is claimed for docker-box runs only.
            if (result.isolation.mode !== 'docker-box') continue;
            if (stopped) return;
            const start = await world.snapshot();
            expect(start.result).toEqual({ success: true });
            const report = await ghostRun(world, start, [action]);
            expect(result.report.changes[0]).toEqual(report.changes[0]);
            compared += 1;
          }
          completed += 1;
        } finally {
          await world.dispose();
          fixture.cleanup();
        }
      };

      const prop = fc.asyncProperty(
        treeArb.chain((tree) =>
          fc.tuple(fc.constant(tree), fc.array(actionArb(tree), { minLength: 1, maxLength: MAX_ACTIONS })),
        ),
        (input) => {
          const p = example(input);
          inFlight = p.catch(() => undefined);
          return p;
        },
      );
      try {
        await fc.assert(prop, pbtParams(true));
      } finally {
        stopped = true;
        await inFlight;
        recordDockerExamples(task, completed);
        console.info(
          `P22: ${String(completed)} of ${String(NUM_RUNS)} examples, ${String(compared)} comparisons (${PBT_MODE})`,
        );
      }
      expect(compared).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );
});
