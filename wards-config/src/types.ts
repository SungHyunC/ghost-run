import type { WardSet } from '@ghost-run/core';

export type ConfigErrorCode =
  | 'yaml-syntax-error'
  | 'yaml-feature-unsupported'
  | 'duplicate-key'
  | 'input-too-large'
  | 'file-unreadable'
  | 'root-not-mapping'
  | 'unknown-root-field'
  | 'wards-not-sequence'
  | 'unknown-kind'
  | 'missing-field'
  | 'unknown-field'
  | 'wrong-type'
  | 'out-of-range'
  | 'duplicate-id'
  | 'invalid-glob'
  | 'invalid-host'
  | 'invalid-character'
  | 'duplicate-entry'
  | 'unsafe-command-entry'
  | 'too-many-errors';

export interface ConfigError {
  readonly code: ConfigErrorCode;
  readonly message: string;
  /** 1-based. */
  readonly line?: number;
  /** 1-based. */
  readonly column?: number;
  readonly wardId?: string;
  /** For example `paths[1]`. */
  readonly field?: string;
  /** Underlying glob or host code. */
  readonly detail?: string;
}

export interface ConfigWarning {
  readonly code: 'empty-ward-set' | 'catch-all-pattern';
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

/** The error result carries no `wardSet` and no `safeCommands`. */
export type ParseResult =
  | {
      readonly ok: true;
      readonly wardSet: WardSet;
      readonly safeCommands: string[];
      readonly warnings: readonly ConfigWarning[];
    }
  | { readonly ok: false; readonly errors: readonly ConfigError[] };
