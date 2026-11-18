// Shared RunEnv builder for the shell tests (prop-11, prop-21, shell-commands).

import type { RunEnv, RunTrace } from '../../src/shell/interpret.js';
import { ACTION_COMMAND_BUDGET } from '../../src/shell/limits.js';
import type { SqlExecutor } from '../../src/sql/executor.js';
import type { Entry, PlaygroundState } from '../../src/state.js';
import { StateFs } from '../../src/vfs/mutable-fs.js';

export interface TestEnvOptions {
  cwd?: string;
  /** Receives every path passed to recordRead. */
  reads?: string[];
  trace?: RunTrace;
  sql?: SqlExecutor;
}

const NO_SQL: SqlExecutor = {
  run: () => Promise.resolve({ ok: false, stderr: 'sql not available in this test' }),
};

export function makeTestEnv(
  entries: Record<string, Entry> = {},
  options: TestEnvOptions = {},
): { fs: StateFs; env: RunEnv } {
  const fs = new StateFs({ entries } as PlaygroundState);
  const reads = options.reads;
  const env: RunEnv = {
    fs,
    cwd: options.cwd ?? '',
    stepIndex: 0,
    trace: options.trace ?? {
      recordRead: (p) => {
        reads?.push(p);
      },
      recordNetwork: () => undefined,
      markWatchdog: () => undefined,
    },
    sql: options.sql ?? NO_SQL,
    depth: 0,
    budget: { commands: ACTION_COMMAND_BUDGET },
  };
  return { fs, env };
}
