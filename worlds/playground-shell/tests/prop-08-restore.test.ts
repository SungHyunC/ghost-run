import { ghostRun } from '@ghost-run/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createPlaygroundWorld, type VirtualProject } from '../src/index.js';
import type { PlaygroundAction } from '../src/state.js';
import { NUM_RUNS, PBT_TIMEOUT, makeYielder } from './pbt-config.js';
import { arbCommandLine } from './support/arb-commands.js';
import { arbVirtualProject } from './support/arb-project.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

const sql = { run: () => Promise.resolve({ ok: false as const, stderr: 'no sql in this test' }) };
const makeWorld = (project: VirtualProject) =>
  createPlaygroundWorld(project, { secretPatterns: ['.env', '*.pem'], sql });

/** Supported lines, unsupported commands, and arbitrary text. */
function arbAction(project: VirtualProject): fc.Arbitrary<PlaygroundAction> {
  const command = fc.oneof(
    { weight: 6, arbitrary: arbCommandLine(project) },
    { weight: 1, arbitrary: fc.constantFrom('frobnicate x', 'ls | cat', 'cat $HOME', 'rm *') },
    { weight: 1, arbitrary: fc.string({ maxLength: 20 }) },
  );
  return command.map((c) => ({ command: c }));
}

const arbProjectAndPlan = arbVirtualProject.chain((project) =>
  fc.record({
    project: fc.constant(project),
    plan: fc.array(arbAction(project), { minLength: 1, maxLength: 50 }),
  }),
);

describe('Property 8: snapshots are immutable and replay is deterministic (contract P3)', () => {
  const tick = makeYielder();

  it(
    'step keeps every snapshot equal to its clone, ids are distinct, and replays end equal',
    async () => {
      // Feature: ghost-shell, Property 8: Snapshots are immutable and replay is deterministic (contract P3)
      // **Validates: Requirements 3.4, 10.4**
      await fc.assert(
        fc.asyncProperty(arbProjectAndPlan, async ({ project, plan }) => {
          await tick();
          const world = makeWorld(project);
          const start = await world.snapshot();
          const startClone = structuredClone(start.state);

          const first = await ghostRun(world, start, plan);
          const clones = first.snapshots.map((s) => structuredClone(s.state));
          const second = await ghostRun(world, start, plan);

          // The input snapshot is unchanged by both runs.
          expect(start.state).toEqual(startClone);
          // No snapshot of the first run changed while the second ran.
          first.snapshots.forEach((s, i) => expect(s.state).toEqual(clones[i]));

          // Ids are pairwise distinct within the world instance (excluding the shared start).
          const ids = [...first.snapshots, ...second.snapshots.slice(1)].map((s) => s.id);
          expect(new Set(ids).size).toBe(ids.length);

          // Replay is deterministic: the same states and results at every position.
          expect(second.snapshots.length).toBe(first.snapshots.length);
          second.snapshots.forEach((s, i) => {
            expect(s.state).toEqual(first.snapshots[i]?.state);
            expect(s.result).toEqual(first.snapshots[i]?.result);
          });
          expect(second.changes).toEqual(first.changes);

          // Restore: a fresh snapshot after the runs equals the pre-run state.
          const again = await world.snapshot();
          expect(again.state).toEqual(startClone);
          expect(again.id).not.toBe(start.id);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: rm leaves the input snapshot intact and replays equal', async () => {
    const enc = new TextEncoder();
    const project: VirtualProject = {
      name: 'demo',
      entries: {
        src: { kind: 'dir' },
        'src/a.txt': { kind: 'file', bytes: enc.encode('hello') },
      },
    };
    const world = makeWorld(project);
    const start = await world.snapshot();
    const clone = structuredClone(start.state);
    const plan = [{ command: 'rm src/a.txt' }, { command: 'echo hi > src/b.txt' }];
    const one = await ghostRun(world, start, plan);
    const two = await ghostRun(world, start, plan);
    expect(start.state).toEqual(clone);
    expect(two.snapshots.at(-1)?.state).toEqual(one.snapshots.at(-1)?.state);
    expect(Object.keys(one.snapshots.at(-1)?.state.entries ?? {}).sort()).toEqual(['src', 'src/b.txt']);
    expect(new Set([...one.snapshots, ...two.snapshots.slice(1)].map((s) => s.id)).size).toBe(5);
    expect((await world.snapshot()).state).toEqual(clone);
  });
});
