import type { SqlExecutor } from './sql/executor.js';

/** Canonical, '/' separators, '' is the project root. */
export type VirtualPath = string;

export type Entry =
  | { readonly kind: 'dir' }
  | {
      readonly kind: 'file';
      readonly bytes: Uint8Array;
      readonly tables?: Readonly<Record<string, number>>;
    };

export interface PlaygroundState {
  readonly entries: Readonly<Record<VirtualPath, Entry>>;
}

export interface PlaygroundAction {
  readonly command: string;
  readonly cwd?: string;
}

/** Fixture input; the root directory is implicit. */
export interface VirtualProject {
  readonly name: string;
  readonly entries: Readonly<Record<VirtualPath, Entry>>;
}

export interface PlaygroundOptions {
  /** Egress `secrets` globs of the active WardSet. */
  readonly secretPatterns: readonly string[];
  readonly sql: SqlExecutor;
}

/** Copy a byte view into a fresh Uint8Array (never tests instanceof). */
export function copyBytes(bytes: ArrayBufferView): Uint8Array {
  const out = new Uint8Array(bytes.byteLength);
  out.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return out;
}

/** Deep copy through structuredClone. */
export function cloneState(state: PlaygroundState): PlaygroundState {
  return structuredClone(state);
}

/**
 * Freeze the record, every entry, and every `tables` record. The byte arrays
 * stay unfrozen (a non-empty typed array cannot be frozen); callers never
 * mutate them in place.
 */
export function freezeState(state: PlaygroundState): PlaygroundState {
  for (const entry of Object.values(state.entries)) {
    if (entry.kind === 'file' && entry.tables !== undefined) Object.freeze(entry.tables);
    Object.freeze(entry);
  }
  Object.freeze(state.entries);
  return Object.freeze(state);
}
