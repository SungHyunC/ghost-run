// Independent execution oracle for contract P2.
//
// It re-executes each action on its own clone with JournalFs and the same
// handlers, and derives the Changes with JournalFs.changes() (the operation
// log), never with diffStates. This file imports neither diff.ts nor StateFs.
//
// `DeterministicTestAdapter.apply` of `@ghost-run/core/verify` is synchronous,
// while every handler is async. The adapter therefore executes asynchronously
// in `executeStep` and keeps the outcome in a memo keyed by (state, action).
// `apply` replays the plan from the memo and throws when a step was not
// executed first. `observe(world)` returns a world whose `step` executes the
// same step through the oracle before delegating, so `verifyWorld(adapter.observe(world), ...)`
// primes the memo during its own ghost run.

import type { Change, World } from '@ghost-run/core';
import type { DeterministicTestAdapter } from '@ghost-run/core/verify';
import { compareCodePoints } from '@ghost-run/core';
import { createRunTrace } from '../../src/shell/run-trace.js';
import { runLine } from '../../src/shell/interpret.js';
import { ACTION_COMMAND_BUDGET } from '../../src/shell/limits.js';
import type { SqlExecutor } from '../../src/sql/executor.js';
import type { Entry, PlaygroundAction, PlaygroundState } from '../../src/state.js';
import { emptyTrace, TraceBuilder } from '../../src/trace.js';
import { JournalFs } from '../../src/vfs/journal-fs.js';
import { toVirtualPath } from '../../src/vfs/path.js';

export interface JournalAdapterOptions {
  readonly secretPatterns: readonly string[];
  readonly sql: SqlExecutor;
}

export interface StepOutcome {
  readonly changes: Change[];
  readonly next: PlaygroundState;
}

export interface JournalAdapter extends DeterministicTestAdapter<PlaygroundState, PlaygroundAction> {
  /** Execute one action on a clone of `state` with JournalFs; memoize and return the outcome. */
  executeStep(state: PlaygroundState, action: PlaygroundAction): Promise<StepOutcome>;
  /** Execute the whole plan asynchronously; the concatenated per-step Changes. */
  executePlan(state: PlaygroundState, actions: readonly PlaygroundAction[]): Promise<Change[]>;
  /** A world whose `step` runs the oracle on the same (state, action) first. */
  observe<W extends World<PlaygroundState, PlaygroundAction>>(world: W): W;
}

const HEX = '0123456789abcdef';

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}

/** Canonical text of a state: sorted paths, kinds, bytes, and sorted tables. */
export function stateKey(state: PlaygroundState): string {
  const parts: string[] = [];
  for (const path of Object.keys(state.entries).sort(compareCodePoints)) {
    const e = state.entries[path] as Entry;
    if (e.kind === 'dir') {
      parts.push(`d:${JSON.stringify(path)}`);
    } else {
      const tables = Object.keys(e.tables ?? {})
        .sort(compareCodePoints)
        .map((t) => `${JSON.stringify(t)}=${String((e.tables ?? {})[t])}`)
        .join(',');
      parts.push(`f:${JSON.stringify(path)}:${hex(e.bytes)}:${tables}`);
    }
  }
  return parts.join('\n');
}

function stateOf(fs: JournalFs): PlaygroundState {
  const entries: Record<string, Entry> = {};
  for (const path of fs.walk('')) entries[path] = fs.get(path) as Entry;
  return { entries };
}

export function createJournalAdapter(options: JournalAdapterOptions): JournalAdapter {
  const memo = new Map<string, StepOutcome>();
  const keyOf = (state: PlaygroundState, action: PlaygroundAction): string =>
    `${JSON.stringify([action.command, action.cwd ?? ''])}\n${stateKey(state)}`;

  async function executeStep(state: PlaygroundState, action: PlaygroundAction): Promise<StepOutcome> {
    const key = keyOf(state, action);
    const known = memo.get(key);
    if (known !== undefined) return known;
    const fs = new JournalFs(state);
    let outcome: StepOutcome;
    const cwd = toVirtualPath(action.cwd ?? '', '');
    if (!cwd.ok) {
      outcome = { changes: [], next: structuredClone(state) };
    } else {
      try {
        const builder = new TraceBuilder(emptyTrace());
        await runLine(action.command, {
          fs,
          cwd: cwd.path,
          stepIndex: 0,
          trace: createRunTrace(builder, 0, options.secretPatterns),
          sql: options.sql,
          depth: 0,
          budget: { commands: ACTION_COMMAND_BUDGET },
        });
        outcome = { changes: fs.changes(), next: stateOf(fs) };
      } catch {
        // Same recovery as the world: an internal error leaves the state unchanged.
        outcome = { changes: [], next: structuredClone(state) };
      }
    }
    memo.set(key, outcome);
    return outcome;
  }

  async function executePlan(
    state: PlaygroundState,
    actions: readonly PlaygroundAction[],
  ): Promise<Change[]> {
    const all: Change[] = [];
    let current = state;
    for (const action of actions) {
      const { changes, next } = await executeStep(current, action);
      all.push(...changes);
      current = next;
    }
    return all;
  }

  return {
    executeStep,
    executePlan,
    apply(state, actions) {
      const all: Change[] = [];
      let current = state;
      for (const action of actions) {
        const outcome = memo.get(keyOf(current, action));
        if (outcome === undefined) {
          throw new Error(
            `journal adapter: step not executed yet (run the plan through adapter.observe(world) first): ${action.command}`,
          );
        }
        all.push(...outcome.changes);
        current = outcome.next;
      }
      return all;
    },
    observe(world) {
      return {
        ...world,
        async step(s, a) {
          await executeStep(s.state, a);
          return world.step(s, a);
        },
      };
    },
  };
}
