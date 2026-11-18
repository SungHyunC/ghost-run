import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createPlaygroundWorld } from '../src/world.js';
import type { PlaygroundState, VirtualProject } from '../src/state.js';
import { NUM_RUNS, PBT_TIMEOUT, makeYielder } from './pbt-config.js';
import { arbVirtualProject } from './support/arb-project.js';
import { arbSimpleCommand } from './support/arb-commands.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

const sql = { run: () => Promise.resolve({ ok: false as const, stderr: 'sql not available' }) };
const make = (project: VirtualProject) =>
  createPlaygroundWorld(project, { secretPatterns: ['.env'], sql });

const word = fc.stringMatching(/^[a-z0-9]{1,6}$/);

/** Simple commands that must be reported unsupported (never silently passed). */
const arbUnsupported: fc.Arbitrary<string> = fc.oneof(
  word.map((w) => `zz${w}`),
  word.map((w) => `zz${w} --flag arg`),
  fc.constantFrom('ls -Z', 'cat -Q x', 'rm -Z x', 'mkdir -Q x', 'echo $HOME', 'echo $(pwd)', 'echo `pwd`'),
  fc.constantFrom('ls | cat', 'cat a | cat', 'echo a | grep a', 'ls > /dev/null 2>&1', 'echo a &'),
  fc.constantFrom('sqlite3 db.sqlite "ATTACH DATABASE \'x\' AS y"', 'sqlite3 db.sqlite ".shell ls"'),
  fc.constantFrom('if true; then ls; fi', 'for i in a; do ls; done', 'cd /', 'sudo ls', 'eval ls'),
);

const arbCommandLike: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      arbUnsupported,
      word,
      fc.constantFrom('|', '&&', ';', '>', '>>', '<', '$', '*', '?', '"', "'", '\\', '`', '(', ')', '{', '}', '-r', '-f', '--'),
    ),
    { maxLength: 8 },
  )
  .map((parts) => parts.join(' '));

const arbText = fc.oneof(fc.string({ maxLength: 40 }), fc.string({ unit: 'binary', maxLength: 20 }), arbCommandLike);

async function checkContract(project: VirtualProject, command: string): Promise<void> {
  const w = make(project);
  const s = await w.snapshot();
  const before = structuredClone(s.state);
  const next = await w.step(s, { command });
  expect(s.state).toEqual(before);
  const record = w.traceOf(next.id)?.steps.at(-1);
  expect(record).toBeDefined();
  if (record === undefined) return;
  if (record.unsupported) {
    expect(record.exitCode).toBe(127);
    expect(typeof record.unsupportedReason).toBe('string');
    expect(next.result).toEqual({ success: false, error: `unsupported: ${record.unsupportedReason}` });
    expect(record.stderr).toContain(`unsupported: ${record.unsupportedReason}`);
  } else if (next.result.success) {
    expect(record.exitCode).toBe(0);
  } else {
    expect(record.exitCode).not.toBe(0);
    expect(next.result.error?.length ?? 0).toBeGreaterThan(0);
  }
}

describe('Property 3: No silent pass (GS-P3)', () => {
  const tick = makeYielder();

  it(
    'step never throws; a step is supported or unsupported with exit 127; failures carry an error',
    async () => {
      // Feature: ghost-shell, Property 3: No silent pass (GS-P3)
      // **Validates: Requirements 3.5, 5.10, 6.1, 6.2, 6.3, 6.7**
      await fc.assert(
        fc.asyncProperty(arbVirtualProject, arbText, async (project, command) => {
          await tick();
          await checkContract(project, command);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'an unsupported simple command leaves no effect and stops the line: state equals the state after the first k commands',
    async () => {
      // Feature: ghost-shell, Property 3: No silent pass (GS-P3)
      // **Validates: Requirements 3.5, 5.10, 6.1, 6.2, 6.3, 6.7**
      await fc.assert(
        fc.asyncProperty(
          arbVirtualProject.chain((project) =>
            fc.tuple(
              fc.constant(project),
              fc.array(arbSimpleCommand(project), { maxLength: 3 }),
              arbUnsupported,
              fc.array(arbSimpleCommand(project), { maxLength: 3 }),
            ),
          ),
          async ([project, head, bad, tail]) => {
            await tick();
            const w = make(project);
            const s = await w.snapshot();
            const full = await w.step(s, { command: [...head, bad, ...tail].join(' ; ') });
            const record = w.traceOf(full.id)?.steps.at(-1);
            expect(record?.unsupported).toBe(true);
            expect(record?.exitCode).toBe(127);
            expect(full.result.success).toBe(false);
            const outcome = full.result;
            if (!outcome.success) expect(outcome.error).toMatch(/^unsupported: ./);
            const expected: PlaygroundState =
              head.length === 0 ? s.state : (await w.step(s, { command: head.join(' ; ') })).state;
            expect(full.state).toEqual(expected);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );
});
