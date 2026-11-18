import type { ObservedEvent, World } from '@ghost-run/core';
import type { Diagnostic } from '../result.js';
import type { ManifestEntry } from '../fs/manifest.js';
import type { SqliteState } from '../fs/sqlite.js';

/** One shell action. `cwd` is relative to the Copy root. */
export interface ShellAction {
  readonly command: string;
  readonly cwd?: string;
}

export type Plan = readonly ShellAction[];

/** How the box ended one action. */
export type StepOutcomeKind = 'exited' | 'timeout' | 'error';

/**
 * Facts of the step that produced a RepoState. Core's `Snapshot` cannot carry observed
 * events, so they travel here (design: Repo_World).
 */
export interface StepRecord {
  readonly stepIndex: number;
  readonly outcome: StepOutcomeKind;
  /** Exit code of the action. `null` for a timeout or a Docker error. */
  readonly exitCode: number | null;
  /** Events of this step. Empty when the recorder is read once at the end of the plan. */
  readonly events: readonly ObservedEvent[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface RepoState {
  /** The Copy directory on the host. */
  readonly rootPath: string;
  /** Sorted by path (byte order). */
  readonly entries: readonly ManifestEntry[];
  readonly sqlite: SqliteState;
  readonly lastStep?: StepRecord;
}

export interface RepoWorld extends World<RepoState, ShellAction> {
  readonly metadata: { readonly id: 'repo'; readonly deterministic: false };
  /** Removes every Copy directory this world created. Idempotent. */
  dispose(): Promise<void>;
}
