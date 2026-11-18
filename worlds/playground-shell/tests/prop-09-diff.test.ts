import { compareCodePoints, ghostRun, type Change } from '@ghost-run/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createPlaygroundWorld, type VirtualProject } from '../src/index.js';
import type { PlaygroundAction, PlaygroundState } from '../src/state.js';
import { diffStates } from '../src/vfs/diff.js';
import { NUM_RUNS, PBT_TIMEOUT, makeYielder } from './pbt-config.js';
import { arbCommandLine } from './support/arb-commands.js';
import { arbVirtualProject } from './support/arb-project.js';
import { createJournalAdapter } from './support/journal-adapter.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

const sql = { run: () => Promise.resolve({ ok: false as const, stderr: 'no sql in this test' }) };
const options = { secretPatterns: ['.env', '*.pem'], sql };
const ALLOWED_KINDS = new Set(['file-created', 'file-deleted', 'file-overwritten', 'sql-row-count']);

/** Supported command lines, plus observation-only `curl` and `npm install` (no sqlite3, no watchdog). */
function arbAction(project: VirtualProject): fc.Arbitrary<PlaygroundAction> {
  const command = fc.oneof(
    { weight: 8, arbitrary: arbCommandLine(project) },
    { weight: 1, arbitrary: fc.constant('curl https://example.test/x') },
    { weight: 1, arbitrary: fc.constant('npm install') },
  );
  return command.map((c) => ({ command: c }));
}

const arbProjectAndPlan = arbVirtualProject.chain((project) =>
  fc.record({
    project: fc.constant(project),
    plan: fc.array(arbAction(project), { minLength: 1, maxLength: 50 }),
  }),
);

function pathOf(c: Change): string {
  return typeof c['path'] === 'string' ? c['path'] : '';
}
function tableOf(c: Change): string {
  return typeof c['table'] === 'string' ? c['table'] : '';
}
function isSorted(changes: readonly Change[]): boolean {
  for (let i = 1; i < changes.length; i++) {
    const a = changes[i - 1] as Change;
    const b = changes[i] as Change;
    const order =
      compareCodePoints(pathOf(a), pathOf(b)) ||
      compareCodePoints(a.kind, b.kind) ||
      compareCodePoints(tableOf(a), tableOf(b));
    if (order > 0) return false;
  }
  return true;
}

describe('Property 9: ghost diff equals the independent execution diff (contract P2)', () => {
  const tick = makeYielder();

  it(
    'ghost changes equal the JournalFs changes of an independent execution, sorted, allowed kinds only',
    async () => {
      // Feature: ghost-shell, Property 9: Ghost diff equals the independent execution diff (contract P2)
      // **Validates: Requirements 3.6, 4.4, 4.5, 4.7, 4.8, 4.9, 10.1, 10.2, 10.5**
      let nonEmpty = 0;
      await fc.assert(
        fc.asyncProperty(arbProjectAndPlan, async ({ project, plan }) => {
          await tick();
          const adapter = createJournalAdapter(options);
          const world = adapter.observe(createPlaygroundWorld(project, options));
          const start = await world.snapshot();
          const startClone = structuredClone(start.state);

          const report = await ghostRun(world, start, plan);
          const ghost = report.changes.flat();

          // Exactly the call verifyWorld makes: a structured clone of the start state.
          const viaApply = adapter.apply(structuredClone(start.state), plan);
          // The oracle run again from scratch, asynchronously.
          const viaPlan = await createJournalAdapter(options).executePlan(startClone, plan);

          expect(ghost).toEqual(viaApply);
          expect(ghost).toEqual(viaPlan);
          if (ghost.length > 0) nonEmpty++;

          for (const step of report.changes) {
            expect(isSorted(step)).toBe(true);
            for (const c of step) expect(ALLOWED_KINDS.has(c.kind)).toBe(true);
          }
        }),
        { numRuns: NUM_RUNS },
      );
      expect(nonEmpty).toBeGreaterThan(0);
    },
    PBT_TIMEOUT,
  );

  it(
    'diffStates of equal states is empty',
    () => {
      // Feature: ghost-shell, Property 9: Ghost diff equals the independent execution diff (contract P2)
      // **Validates: Requirements 4.7, 10.5**
      fc.assert(
        fc.property(arbVirtualProject, (project) => {
          const a: PlaygroundState = { entries: project.entries };
          const b: PlaygroundState = structuredClone(a);
          expect(diffStates(a, a)).toEqual([]);
          expect(diffStates(a, b)).toEqual([]);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: delete, create, overwrite and a dropped table agree', async () => {
    const enc = new TextEncoder();
    const project: VirtualProject = {
      name: 'demo',
      entries: {
        'a.txt': { kind: 'file', bytes: enc.encode('one') },
        'app.db': { kind: 'file', bytes: enc.encode('SQL'), tables: { users: 4 } },
      },
    };
    const plan = [
      { command: 'rm a.txt' },
      { command: 'echo hi > b.txt' },
      { command: 'echo x > app.db' },
    ];
    const adapter = createJournalAdapter(options);
    const world = adapter.observe(createPlaygroundWorld(project, options));
    const start = await world.snapshot();
    const report = await ghostRun(world, start, plan);
    const ghost = report.changes.flat();
    expect(ghost).toEqual(adapter.apply(structuredClone(start.state), plan));
    expect(ghost.map((c) => c.kind)).toEqual([
      'file-deleted',
      'file-created',
      'file-overwritten',
      'sql-row-count',
    ]);
  });
});
