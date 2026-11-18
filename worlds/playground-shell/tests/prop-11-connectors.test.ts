import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runLine } from '../src/shell/interpret.js';
import { ACTION_COMMAND_BUDGET } from '../src/shell/limits.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { makeTestEnv } from './support/env.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

type Cmd = { kind: 'true' } | { kind: 'false' } | { kind: 'echo'; word: string };
type Connector = ';' | '&&';

const arbCmd: fc.Arbitrary<Cmd> = fc.oneof(
  fc.constant<Cmd>({ kind: 'true' }),
  fc.constant<Cmd>({ kind: 'false' }),
  fc
    .stringMatching(/^[a-z][a-z0-9]{0,5}$/)
    .map((word): Cmd => ({ kind: 'echo', word })),
);

const arbLine = fc.record({
  first: arbCmd,
  rest: fc.array(
    fc.record({
      connector: fc.constantFrom<Connector>(';', '&&'),
      cmd: arbCmd,
    }),
    { maxLength: 8 },
  ),
});

const text = (c: Cmd): string => (c.kind === 'echo' ? `echo ${c.word}` : c.kind);

/** Reference evaluator: run a command unless its connector is && and the last exit code is not 0. */
function reference(line: { first: Cmd; rest: { connector: Connector; cmd: Cmd }[] }): {
  executed: number;
  stdout: string;
  exitCode: number;
} {
  let executed = 0;
  let stdout = '';
  let exitCode = 0;
  const all: { connector: Connector | null; cmd: Cmd }[] = [
    { connector: null, cmd: line.first },
    ...line.rest,
  ];
  for (const { connector, cmd } of all) {
    if (connector === '&&' && exitCode !== 0) continue;
    executed++;
    if (cmd.kind === 'echo') stdout += `${cmd.word}\n`;
    exitCode = cmd.kind === 'false' ? 1 : 0;
  }
  return { executed, stdout, exitCode };
}

const makeEnv = () => makeTestEnv().env;

describe('Property 11: Connector semantics', () => {
  it(
    'executed commands and final exit code equal the reference evaluator',
    async () => {
      // Feature: ghost-shell, Property 11: Connector semantics
      // **Validates: Requirements 5.2**
      await fc.assert(
        fc.asyncProperty(arbLine, async (line) => {
          const source = [text(line.first), ...line.rest.map((r) => `${r.connector} ${text(r.cmd)}`)]
            .join(' ')
            .replace(/ (?=;)/g, '');
          const env = makeEnv();
          const result = await runLine(source, env);
          const expected = reference(line);
          expect(ACTION_COMMAND_BUDGET - env.budget.commands).toBe(expected.executed);
          expect(result.stdout).toBe(expected.stdout);
          expect(result.exitCode).toBe(expected.exitCode);
          expect(result.unsupportedReason).toBeUndefined();
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: `false && echo a ; echo b` skips only the && command', async () => {
    const env = makeEnv();
    const result = await runLine('false && echo a ; echo b', env);
    expect(result.stdout).toBe('b\n');
    expect(result.exitCode).toBe(0);
    expect(ACTION_COMMAND_BUDGET - env.budget.commands).toBe(2);
  });
});
