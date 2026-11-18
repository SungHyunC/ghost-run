import { compareCodePoints, type Change } from '@ghost-run/core';
import type { Entry, PlaygroundState } from '../state.js';

type EntryType = 'file' | 'directory';

function entryType(entry: Entry): EntryType {
  return entry.kind === 'dir' ? 'directory' : 'file';
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

function rowChanges(
  path: string,
  before: Readonly<Record<string, number>> | undefined,
  after: Readonly<Record<string, number>> | undefined,
): Change[] {
  if (before === undefined) return [];
  const out: Change[] = [];
  for (const table of Object.keys(before)) {
    const rowsBefore = before[table] as number;
    const rowsAfter = after?.[table];
    if (rowsAfter === undefined) {
      out.push({ kind: 'sql-row-count', path, table, rowsBefore, rowsAfter: 0, dropped: true });
    } else if (rowsAfter !== rowsBefore) {
      out.push({ kind: 'sql-row-count', path, table, rowsBefore, rowsAfter });
    }
  }
  return out;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function compareChanges(a: Change, b: Change): number {
  return (
    compareCodePoints(str(a['path']), str(b['path'])) ||
    compareCodePoints(a.kind, b.kind) ||
    compareCodePoints(str(a['table']), str(b['table']))
  );
}

/** State-based Change derivation. Pure; never emits `symlink-changed`. */
export function diffStates(before: PlaygroundState, after: PlaygroundState): Change[] {
  const changes: Change[] = [];
  const paths = new Set([...Object.keys(before.entries), ...Object.keys(after.entries)]);
  for (const path of paths) {
    const b = before.entries[path];
    const a = after.entries[path];
    if (b === undefined && a !== undefined) {
      changes.push({ kind: 'file-created', path, entryType: entryType(a) });
    } else if (b !== undefined && a === undefined) {
      changes.push({ kind: 'file-deleted', path, entryType: entryType(b) });
    } else if (b !== undefined && a !== undefined) {
      if (b.kind === 'dir' && a.kind === 'dir') continue;
      if (b.kind === 'file' && a.kind === 'file') {
        if (sameBytes(b.bytes, a.bytes)) continue;
        changes.push({
          kind: 'file-overwritten',
          path,
          sizeBefore: b.bytes.byteLength,
          sizeAfter: a.bytes.byteLength,
        });
        changes.push(...rowChanges(path, b.tables, a.tables));
      } else {
        changes.push({ kind: 'file-deleted', path, entryType: entryType(b) });
        changes.push({ kind: 'file-created', path, entryType: entryType(a) });
      }
    }
  }
  return changes.sort(compareChanges);
}
