// createPlaygroundWorld: the six World functions plus traceOf.

import type { Change, Effect, FingerprintResult, Scene, Snapshot } from '@ghost-run/core';
import type { World } from '@ghost-run/core';
import { effectsOutside as effectsOutsideAction } from './shell/effects.js';
import { runLine } from './shell/interpret.js';
import { ACTION_COMMAND_BUDGET } from './shell/limits.js';
import { createRunTrace } from './shell/run-trace.js';
import {
  cloneState,
  freezeState,
  type PlaygroundAction,
  type PlaygroundOptions,
  type PlaygroundState,
  type VirtualProject,
} from './state.js';
import { emptyTrace, TraceBuilder, type StepRecord, type Trace } from './trace.js';
import { diffStates } from './vfs/diff.js';
import { fingerprintState } from './vfs/fingerprint.js';
import { StateFs } from './vfs/mutable-fs.js';
import { toVirtualPath } from './vfs/path.js';
import { renderScene } from './vfs/scene.js';

export interface PlaygroundWorld extends World<PlaygroundState, PlaygroundAction> {
  readonly metadata: { readonly id: 'playground-shell'; readonly deterministic: true };
  traceOf(snapshotId: string): Trace | undefined;
}

function failureText(record: StepRecord): string {
  if (record.unsupported) return `unsupported: ${record.unsupportedReason ?? 'unknown'}`;
  const line = record.stderr.split('\n').find((l) => l.trim() !== '');
  return line !== undefined ? line.trim() : `exit code ${record.exitCode}`;
}

function resultOf(record: StepRecord): Snapshot<PlaygroundState>['result'] {
  if (!record.unsupported && record.exitCode === 0) return { success: true };
  return { success: false, error: failureText(record) };
}

function internalErrorRecord(command: string, stepIndex: number): StepRecord {
  return {
    stepIndex,
    command,
    exitCode: 127,
    stdout: '',
    stderr: 'unsupported: internal error',
    unsupported: true,
    unsupportedReason: 'internal error',
    watchdog: false,
  };
}

export function createPlaygroundWorld(
  project: VirtualProject,
  options: PlaygroundOptions,
): PlaygroundWorld {
  const live: PlaygroundState = freezeState(cloneState({ entries: project.entries }));
  const projectName = project.name;
  const secretPatterns = [...options.secretPatterns];
  const traces = new Map<string, Trace>();
  let counter = 0;

  const nextId = (): string => `snap-${++counter}`;

  async function runStep(
    s: Snapshot<PlaygroundState>,
    a: PlaygroundAction,
    previous: Trace,
  ): Promise<{ state: PlaygroundState; trace: Trace; record: StepRecord }> {
    const stepIndex = previous.steps.length;
    const builder = new TraceBuilder(previous);
    const fs = new StateFs(s.state);
    const cwd = toVirtualPath(a.cwd ?? '', '');
    if (!cwd.ok) {
      const record: StepRecord = {
        stepIndex,
        command: a.command,
        exitCode: 127,
        stdout: '',
        stderr: 'unsupported: invalid working directory',
        unsupported: true,
        unsupportedReason: 'invalid working directory',
        watchdog: false,
      };
      builder.addStep(record);
      return { state: fs.toState(), trace: builder.build(), record };
    }
    const line = await runLine(a.command, {
      fs,
      cwd: cwd.path,
      stepIndex,
      trace: createRunTrace(builder, stepIndex, secretPatterns),
      sql: options.sql,
      depth: 0,
      budget: { commands: ACTION_COMMAND_BUDGET },
    });
    const record: StepRecord = {
      stepIndex,
      command: a.command,
      exitCode: line.exitCode,
      stdout: line.stdout,
      stderr: line.stderr,
      unsupported: line.unsupportedReason !== undefined,
      ...(line.unsupportedReason !== undefined ? { unsupportedReason: line.unsupportedReason } : {}),
      watchdog: line.watchdog,
    };
    builder.addStep(record);
    return { state: fs.toState(), trace: builder.build(), record };
  }

  return {
    metadata: { id: 'playground-shell', deterministic: true },

    snapshot(): Promise<Snapshot<PlaygroundState>> {
      const id = nextId();
      traces.set(id, emptyTrace());
      return Promise.resolve({ id, state: cloneState(live), result: { success: true } });
    },

    async step(s, a): Promise<Snapshot<PlaygroundState>> {
      const previous = traces.get(s.id) ?? emptyTrace();
      let state: PlaygroundState;
      let trace: Trace;
      let record: StepRecord;
      try {
        ({ state, trace, record } = await runStep(s, a, previous));
      } catch {
        record = internalErrorRecord(a.command, previous.steps.length);
        const builder = new TraceBuilder(previous);
        builder.addStep(record);
        trace = builder.build();
        state = cloneState(s.state);
      }
      const id = nextId();
      traces.set(id, trace);
      return { id, state, result: resultOf(record) };
    },

    diff(before, after): Change[] {
      return diffStates(before.state, after.state);
    },

    render(s): Scene {
      return renderScene(s.state, projectName);
    },

    fingerprint(): Promise<FingerprintResult> {
      return fingerprintState(live);
    },

    effectsOutside(a): Effect[] {
      return effectsOutsideAction(a);
    },

    traceOf(snapshotId): Trace | undefined {
      return traces.get(snapshotId);
    },
  };
}
