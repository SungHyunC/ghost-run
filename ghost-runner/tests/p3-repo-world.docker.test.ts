// Feature: ghost-runner, Property 20: P3 for the Repo_World (claimed in all worlds)
// Validates: Requirements 2.3, 17.3
// [docker] Needs the box image; skipped (docker unavailable) otherwise via describeDocker.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import fc from 'fast-check';
import { afterAll, expect, it } from 'vitest';
import type { Change, Snapshot } from '@ghost-run/core';
import type { DockerClient } from '../src/docker/cli.js';
import { createDockerClient } from '../src/docker/cli.js';
import { createRepoWorld } from '../src/world/repo-world.js';
import type { RepoState, ShellAction } from '../src/world/types.js';
import { describeDocker, recordDockerExamples } from './docker-available.js';
import { materializeTree, treeArb, type TreeEntry } from './fixtures/index.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

/** Structural listing of a directory: path -> type, size, content hash or link target. Never follows links. */
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

/**
 * Plans of 1 to 50 actions. Each step costs one box (create, exec, remove: about 0.4 s), and every
 * plan runs twice, so lengths are weighted toward short plans: most plans have 1 to 6 actions,
 * some 7 to 20, and a few the full 21 to 50. The property is unchanged; only the length
 * distribution is. Mean length is about 4.3 actions, so 100 examples take about 4 minutes.
 */
function planArb(tree: readonly TreeEntry[]): fc.Arbitrary<ShellAction[]> {
  const action = actionArb(tree);
  return fc.oneof(
    { arbitrary: fc.array(action, { minLength: 1, maxLength: 6 }), weight: 94 },
    { arbitrary: fc.array(action, { minLength: 7, maxLength: 20 }), weight: 5 },
    { arbitrary: fc.array(action, { minLength: 21, maxLength: 50 }), weight: 1 },
  );
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

describeDocker('P3 on the Repo_World (docker)', () => {
  const runIds = new Set<string>();

  afterAll(() => {
    // One query per kind (not per run id): a run creates thousands of boxes.
    const leftover: string[] = [];
    const queries: string[][] = [
      ['ps', '-a', '--filter', 'label=ghost-run.run-id', '--format', '{{.ID}}\t{{.Label "ghost-run.run-id"}}'],
      ['volume', 'ls', '--filter', 'label=ghost-run.run-id', '--format', '{{.Name}}\t{{.Label "ghost-run.run-id"}}'],
    ];
    for (const q of queries) {
      const r = spawnSync('docker', q, { encoding: 'utf8' });
      for (const line of r.stdout.split('\n')) {
        const [id, runId] = line.split('\t');
        if (id !== undefined && id !== '' && runId !== undefined && runIds.has(runId)) leftover.push(id);
      }
    }
    expect(leftover).toEqual([]);
  }, 60_000);

  it(
    'Property 20: step leaves the input directory identical and is deterministic',
    async ({ task }) => {
      let completed = 0;
      // fast-check's time limit returns while an example may still run; stop it and wait for it.
      let stopped = false;
      let inFlight: Promise<unknown> = Promise.resolve();
      const example = async ([tree, plan]: [TreeEntry[], ShellAction[]]): Promise<void> => {
        const fixture = materializeTree(tree);
        const world = createRepoWorld({ original: fixture.root, client: wrapClient(runIds) });
        try {
          const s0 = await world.snapshot();
          expect(s0.result).toEqual({ success: true });
          const s0Listing = listing(s0.state.rootPath);

          const runSequence = async (): Promise<{ steps: Change[][]; last: Snapshot<RepoState> } | undefined> => {
            const steps: Change[][] = [];
            let cur = s0;
            for (const action of plan) {
              if (stopped) return undefined;
              const before = listing(cur.state.rootPath);
              const next = await world.step(cur, action);
              expect(next.result).toEqual({ success: true });
              // The input snapshot's directory is structurally identical after the step.
              expect(listing(cur.state.rootPath)).toEqual(before);
              steps.push(world.diff(cur, next));
              cur = next;
            }
            return { steps, last: cur };
          };

          // Two sequences from the same snapshot, in parallel (Docker pool of 2 slots).
          const [a, b] = await Promise.all([runSequence(), runSequence()]);
          if (a === undefined || b === undefined) return;
          expect(b.steps).toEqual(a.steps);
          expect(world.diff(s0, b.last)).toEqual(world.diff(s0, a.last));
          expect(listing(s0.state.rootPath)).toEqual(s0Listing);
          completed += 1;
        } finally {
          await world.dispose();
          fixture.cleanup();
        }
      };
      const prop = fc.asyncProperty(
        treeArb.chain((tree) => fc.tuple(fc.constant(tree), planArb(tree))),
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
        console.info(`P3 Repo_World property: ${String(completed)} of ${String(NUM_RUNS)} examples (${PBT_MODE})`);
      }
    },
    PBT_MODE === 'save' ? testTimeoutMs(true) : 0,
  );
});
