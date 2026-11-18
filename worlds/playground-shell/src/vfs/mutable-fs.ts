import { compareCodePoints } from '@ghost-run/core';
import { ENTRIES_MAX, FILE_MAX, TOTAL_MAX } from '../shell/limits.js';
import { copyBytes, type Entry, type PlaygroundState, type VirtualPath } from '../state.js';

/** Thrown when a write would exceed a limit of the Virtual_FS. */
export class LimitError extends Error {
  readonly limit: 'entries' | 'file-size' | 'total-size';

  constructor(limit: 'entries' | 'file-size' | 'total-size') {
    super(`limit exceeded: ${limit}`);
    this.name = 'LimitError';
    this.limit = limit;
  }
}

/** Opaque position in the undo log of a file system. */
export type FsMark = number;

/**
 * The mutable file system the interpreter works on. The root directory ('')
 * always exists and is never listed as an entry of its own.
 */
export interface MutableFs {
  /** The entry at `path` (bytes copied), or undefined. The root is a directory. */
  get(path: VirtualPath): Entry | undefined;
  /** Names of the direct children of the directory `dir`, in code-point order. */
  list(dir: VirtualPath): string[];
  /** `path` itself (when it exists and is not the root) and every descendant, in code-point order. */
  walk(path: VirtualPath): VirtualPath[];
  /** Create or replace a regular file. Throws LimitError. */
  putFile(path: VirtualPath, bytes: Uint8Array, tables?: Readonly<Record<string, number>>): void;
  /** Create a directory (replacing a file at the same path). Throws LimitError. */
  putDir(path: VirtualPath): void;
  /** Remove the entry and all of its descendants. */
  remove(path: VirtualPath): void;
  /** Remember the current state for a later rollback. */
  mark(): FsMark;
  /** Return to the state at `mark`. */
  rollback(mark: FsMark): void;
}

interface UndoRecord {
  readonly path: VirtualPath;
  readonly previous: Entry | undefined;
}

function entrySize(entry: Entry | undefined): number {
  return entry !== undefined && entry.kind === 'file' ? entry.bytes.byteLength : 0;
}

function isInside(path: VirtualPath, ancestor: VirtualPath): boolean {
  return ancestor === '' ? path !== '' : path.startsWith(`${ancestor}/`);
}

/** Clone-based implementation over a private copy of a state. */
export class StateFs implements MutableFs {
  private readonly entries = new Map<VirtualPath, Entry>();
  private readonly undo: UndoRecord[] = [];
  private total = 0;

  constructor(state: PlaygroundState) {
    for (const [path, entry] of Object.entries(state.entries)) {
      const own = copyEntry(entry);
      this.entries.set(path, own);
      this.total += entrySize(own);
    }
  }

  get(path: VirtualPath): Entry | undefined {
    if (path === '') return { kind: 'dir' };
    const entry = this.entries.get(path);
    return entry === undefined ? undefined : copyEntry(entry);
  }

  list(dir: VirtualPath): string[] {
    const prefix = dir === '' ? '' : `${dir}/`;
    const names: string[] = [];
    for (const path of this.entries.keys()) {
      if (!path.startsWith(prefix) || path === dir) continue;
      const rest = path.slice(prefix.length);
      if (rest !== '' && !rest.includes('/')) names.push(rest);
    }
    return names.sort(compareCodePoints);
  }

  walk(path: VirtualPath): VirtualPath[] {
    const out: VirtualPath[] = [];
    for (const p of this.entries.keys()) {
      if (p === path || isInside(p, path)) out.push(p);
    }
    return out.sort(compareCodePoints);
  }

  putFile(path: VirtualPath, bytes: Uint8Array, tables?: Readonly<Record<string, number>>): void {
    if (bytes.byteLength > FILE_MAX) throw new LimitError('file-size');
    const entry: Entry =
      tables === undefined
        ? { kind: 'file', bytes: copyBytes(bytes) }
        : { kind: 'file', bytes: copyBytes(bytes), tables: { ...tables } };
    this.set(path, entry);
  }

  putDir(path: VirtualPath): void {
    this.set(path, { kind: 'dir' });
  }

  remove(path: VirtualPath): void {
    for (const p of this.walk(path)) this.set(p, undefined);
  }

  mark(): FsMark {
    return this.undo.length;
  }

  rollback(mark: FsMark): void {
    while (this.undo.length > mark) {
      const record = this.undo.pop() as UndoRecord;
      this.apply(record.path, record.previous);
    }
  }

  /** A fresh state holding copies of the current entries. */
  toState(): PlaygroundState {
    const entries: Record<VirtualPath, Entry> = {};
    for (const path of [...this.entries.keys()].sort(compareCodePoints)) {
      entries[path] = copyEntry(this.entries.get(path) as Entry);
    }
    return { entries };
  }

  private set(path: VirtualPath, entry: Entry | undefined): void {
    if (path === '' && entry !== undefined) return;
    if (entry !== undefined) {
      const previous = this.entries.get(path);
      if (previous === undefined && this.entries.size + 1 > ENTRIES_MAX) {
        throw new LimitError('entries');
      }
      if (this.total - entrySize(previous) + entrySize(entry) > TOTAL_MAX) {
        throw new LimitError('total-size');
      }
    }
    if (path === '') return;
    this.undo.push({ path, previous: this.entries.get(path) });
    this.apply(path, entry);
  }

  private apply(path: VirtualPath, entry: Entry | undefined): void {
    this.total -= entrySize(this.entries.get(path));
    if (entry === undefined) {
      this.entries.delete(path);
    } else {
      this.entries.set(path, entry);
      this.total += entrySize(entry);
    }
  }
}

function copyEntry(entry: Entry): Entry {
  if (entry.kind === 'dir') return { kind: 'dir' };
  return entry.tables === undefined
    ? { kind: 'file', bytes: copyBytes(entry.bytes) }
    : { kind: 'file', bytes: copyBytes(entry.bytes), tables: { ...entry.tables } };
}
