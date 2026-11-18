import { compareCodePoints, type Change } from '@ghost-run/core';
import { ENTRIES_MAX, FILE_MAX, TOTAL_MAX } from '../shell/limits.js';
import { copyBytes, type Entry, type PlaygroundState, type VirtualPath } from '../state.js';
import { LimitError, type FsMark, type MutableFs } from './mutable-fs.js';

/** One recorded operation. `bytes` and `tables` are present for file puts only. */
export interface JournalOp {
  readonly op: 'put' | 'remove';
  readonly path: VirtualPath;
  readonly kind: 'file' | 'dir';
  readonly bytes?: Uint8Array;
  readonly tables?: Readonly<Record<string, number>>;
}

function copyEntry(entry: Entry): Entry {
  if (entry.kind === 'dir') return { kind: 'dir' };
  return entry.tables === undefined
    ? { kind: 'file', bytes: copyBytes(entry.bytes) }
    : { kind: 'file', bytes: copyBytes(entry.bytes), tables: { ...entry.tables } };
}

function entryOfPut(op: JournalOp): Entry {
  if (op.kind === 'dir') return { kind: 'dir' };
  const bytes = copyBytes(op.bytes as Uint8Array);
  return op.tables === undefined
    ? { kind: 'file', bytes }
    : { kind: 'file', bytes, tables: { ...op.tables } };
}

function sizeOf(entry: Entry | undefined): number {
  return entry !== undefined && entry.kind === 'file' ? entry.bytes.byteLength : 0;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((v, i) => v === b[i]);
}

function under(path: VirtualPath, root: VirtualPath): boolean {
  return root === '' ? path !== '' : path === root || path.startsWith(`${root}/`);
}

function sortKey(c: Change): [string, string, string] {
  const path = c['path'];
  const table = c['table'];
  return [typeof path === 'string' ? path : '', c.kind, typeof table === 'string' ? table : ''];
}

function order(a: Change, b: Change): number {
  const x = sortKey(a);
  const y = sortKey(b);
  return (
    compareCodePoints(x[0], y[0]) || compareCodePoints(x[1], y[1]) || compareCodePoints(x[2], y[2])
  );
}

/**
 * Operation-log file system. It is the independent oracle for the ghost diff:
 * `changes()` is derived from the operations alone and never from two states.
 */
export class JournalFs implements MutableFs {
  private readonly start = new Map<VirtualPath, Entry>();
  private current = new Map<VirtualPath, Entry>();
  private ops: JournalOp[] = [];
  private total = 0;

  constructor(state: PlaygroundState) {
    for (const [path, entry] of Object.entries(state.entries)) {
      this.start.set(path, copyEntry(entry));
    }
    this.rebuild(0);
  }

  get(path: VirtualPath): Entry | undefined {
    if (path === '') return { kind: 'dir' };
    const entry = this.current.get(path);
    return entry === undefined ? undefined : copyEntry(entry);
  }

  list(dir: VirtualPath): string[] {
    const prefix = dir === '' ? '' : `${dir}/`;
    const names: string[] = [];
    for (const path of this.current.keys()) {
      if (path === dir || !path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest !== '' && !rest.includes('/')) names.push(rest);
    }
    return names.sort(compareCodePoints);
  }

  walk(path: VirtualPath): VirtualPath[] {
    return [...this.current.keys()].filter((p) => under(p, path)).sort(compareCodePoints);
  }

  putFile(path: VirtualPath, bytes: Uint8Array, tables?: Readonly<Record<string, number>>): void {
    if (bytes.byteLength > FILE_MAX) throw new LimitError('file-size');
    if (path === '') return;
    const op: JournalOp =
      tables === undefined
        ? { op: 'put', path, kind: 'file', bytes: copyBytes(bytes) }
        : { op: 'put', path, kind: 'file', bytes: copyBytes(bytes), tables: { ...tables } };
    this.record(op);
  }

  putDir(path: VirtualPath): void {
    if (path === '') return;
    this.record({ op: 'put', path, kind: 'dir' });
  }

  remove(path: VirtualPath): void {
    for (const p of this.walk(path)) {
      const kind = (this.current.get(p) as Entry).kind;
      this.record({ op: 'remove', path: p, kind });
    }
  }

  mark(): FsMark {
    return this.ops.length;
  }

  rollback(mark: FsMark): void {
    if (mark >= this.ops.length) return;
    this.ops.length = mark;
    this.rebuild(mark);
  }

  /** The recorded operations, in order (copies of the records). */
  operations(): JournalOp[] {
    return this.ops.map((o) => ({ ...o }));
  }

  /** Change list derived from the operation log alone, sorted by path, kind, table. */
  changes(): Change[] {
    const first = new Map<VirtualPath, Entry | undefined>();
    const last = new Map<VirtualPath, Entry | undefined>();
    const live = new Map(this.start);
    for (const op of this.ops) {
      if (!first.has(op.path)) first.set(op.path, live.get(op.path));
      if (op.op === 'put') {
        const entry = entryOfPut(op);
        live.set(op.path, entry);
        last.set(op.path, entry);
      } else {
        live.delete(op.path);
        last.set(op.path, undefined);
      }
    }
    const out: Change[] = [];
    for (const [path, before] of first) {
      out.push(...this.classify(path, before, last.get(path)));
    }
    return out.sort(order);
  }

  /** Decision table: (before, after) of one path to Changes. */
  private classify(path: VirtualPath, before: Entry | undefined, after: Entry | undefined): Change[] {
    const type = (e: Entry): 'file' | 'directory' => (e.kind === 'dir' ? 'directory' : 'file');
    if (before === undefined && after === undefined) return [];
    if (before === undefined) return [{ kind: 'file-created', path, entryType: type(after as Entry) }];
    if (after === undefined) return [{ kind: 'file-deleted', path, entryType: type(before) }];
    if (before.kind === 'dir' && after.kind === 'dir') return [];
    if (before.kind !== after.kind) {
      return [
        { kind: 'file-deleted', path, entryType: type(before) },
        { kind: 'file-created', path, entryType: type(after) },
      ];
    }
    if (before.kind !== 'file' || after.kind !== 'file') return [];
    if (equalBytes(before.bytes, after.bytes)) return [];
    const out: Change[] = [
      {
        kind: 'file-overwritten',
        path,
        sizeBefore: before.bytes.byteLength,
        sizeAfter: after.bytes.byteLength,
      },
    ];
    for (const [table, rowsBefore] of Object.entries(before.tables ?? {})) {
      const rowsAfter = after.tables?.[table];
      if (rowsAfter === undefined) {
        out.push({ kind: 'sql-row-count', path, table, rowsBefore, rowsAfter: 0, dropped: true });
      } else if (rowsAfter !== rowsBefore) {
        out.push({ kind: 'sql-row-count', path, table, rowsBefore, rowsAfter });
      }
    }
    return out;
  }

  private record(op: JournalOp): void {
    if (op.op === 'put') {
      const entry = entryOfPut(op);
      const previous = this.current.get(op.path);
      if (previous === undefined && this.current.size + 1 > ENTRIES_MAX) {
        throw new LimitError('entries');
      }
      if (this.total - sizeOf(previous) + sizeOf(entry) > TOTAL_MAX) {
        throw new LimitError('total-size');
      }
    }
    this.ops.push(op);
    this.applyOp(this.current, op);
  }

  private rebuild(count: number): void {
    this.current = new Map();
    for (const [path, entry] of this.start) this.current.set(path, copyEntry(entry));
    this.total = 0;
    for (const entry of this.current.values()) this.total += sizeOf(entry);
    for (let i = 0; i < count; i++) this.applyOp(this.current, this.ops[i] as JournalOp);
  }

  private applyOp(into: Map<VirtualPath, Entry>, op: JournalOp): void {
    this.total -= sizeOf(into.get(op.path));
    if (op.op === 'put') {
      const entry = entryOfPut(op);
      into.set(op.path, entry);
      this.total += sizeOf(entry);
    } else {
      into.delete(op.path);
    }
  }
}
