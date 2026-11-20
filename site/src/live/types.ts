// The live contract: what the page gives an engine and what an engine answers.
// Types only. Adapters implement LiveEngine; the page reads LiveAnswer.

/// <reference path="../../../worlds/playground-shell/src/sql-js.d.ts" />

import type { PlanRecord, RealityScene, WorldId, WorldRecord } from '../data/types';

/** The five ways a run can end, as the walkthrough shows them. */
export type Outcome = 'block-fixed' | 'block-open' | 'pass' | 'warn' | 'unsupported';

/** Shown for unsupported input: the engine's fixed reason and the commands of the world. No input echo. */
export interface UnsupportedNote {
  reason: string;
  known: string[];
}

export type LiveInput =
  | { world: 'shell'; actions: readonly string[] }
  | { world: 'cloud'; lines: readonly string[] }
  | { world: 'hand'; speed: number; force: number; distance: number };

export interface LiveRun {
  world: WorldId;
  /** Headline ward: id, kind, kind line. */
  ward: WorldRecord['ward'];
  /** From the live world's snapshot before the run. */
  reality: RealityScene;
  /** The Plan_Record of the run. */
  plan: PlanRecord;
}

export type LiveAnswer =
  | { status: 'ran'; run: LiveRun }
  | { status: 'unsupported'; reason: string; stepIndexes: number[] }
  | { status: 'rejected'; problem: 'empty' | 'too-long' | 'invalid-character' | 'out-of-range' }
  /** `detail` is a short plain-text cause for the console; it is never shown on the page. */
  | { status: 'failed'; cause: 'load' | 'run' | 'timeout' | 'internal'; detail?: string };

/** What the light chunk hands over: the Shell and Cloud engines and one `dispose` for both. */
export interface LightEngines {
  shell: LiveEngine;
  cloud: LiveEngine;
  dispose(): void;
}

/** The two lazy chunks. Tests pass spies; the default holds the dynamic imports. */
export interface LiveLoaders {
  light(): Promise<LightEngines>;
  hand(): Promise<LiveEngine>;
}

export interface LiveEngine {
  readonly world: WorldId;
  /** Shell: starts the SQL worker and loads the wasm. Others: no-op. */
  warm(): Promise<void>;
  /** Never throws. Serial per engine: a second call waits for the first. */
  run(input: LiveInput): Promise<LiveAnswer>;
  /** Terminates workers and releases simulation objects. */
  dispose(): void;
}
