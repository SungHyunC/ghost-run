// The data behind the mirror stage picture: the project before the ghost run (reality) and after it (the copy),
// read from the run's first and last scene, its changes, and its observed events. Pure: no React, no DOM.
// The kit Mirror World table stays the complete, accessible record; this model only feeds the picture.
import type { Change, Effect, ObservedEvent, SceneValue } from '@ghost-run/core';

export type EntryStatus = 'same' | 'deleted' | 'created' | 'changed';

export interface StageEntry {
  readonly path: string;
  readonly name: string;
  readonly depth: number;
  readonly kind: 'file' | 'directory';
  /** Status in the copy after the ghost run. */
  readonly status: EntryStatus;
  /** Read as a secret during the run (an observed secret-read event). */
  readonly secretRead: boolean;
  /** Holds a database of the scene. */
  readonly database: boolean;
  /** Present in reality (the first scene). */
  readonly inReality: boolean;
}

export interface StageTable {
  readonly database: string;
  readonly name: string;
  readonly before: number;
  readonly after: number;
  readonly dropped: boolean;
}

export interface StageEgress {
  readonly destination: string;
  /** Secret files read in the same step as the network attempt. */
  readonly secrets: readonly string[];
}

export interface StageModel {
  readonly entries: readonly StageEntry[];
  readonly tables: readonly StageTable[];
  readonly egress: readonly StageEgress[];
  /** Number of entries and tables that differ between reality and the copy. */
  readonly differences: number;
}

export interface StageInput {
  readonly before: SceneValue | undefined;
  readonly after: SceneValue | undefined;
  readonly changes: readonly Change[];
  readonly events: readonly ObservedEvent[];
  readonly effects: readonly Effect[];
}

interface FileRow {
  readonly path: string;
  readonly kind: 'file' | 'directory';
}

interface TableRow {
  readonly database: string;
  readonly name: string;
  readonly rows: number;
}

function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function filesOf(scene: unknown): FileRow[] {
  if (!isRecord(scene) || !Array.isArray(scene.files)) return [];
  const out: FileRow[] = [];
  for (const f of scene.files) {
    if (!isRecord(f) || typeof f.path !== 'string') continue;
    out.push({ path: f.path, kind: f.type === 'directory' ? 'directory' : 'file' });
  }
  return out;
}

function tablesOf(scene: unknown): TableRow[] {
  if (!isRecord(scene) || !Array.isArray(scene.databases)) return [];
  const out: TableRow[] = [];
  for (const db of scene.databases) {
    if (!isRecord(db) || typeof db.path !== 'string' || !Array.isArray(db.tables)) continue;
    for (const t of db.tables) {
      if (!isRecord(t) || typeof t.name !== 'string' || typeof t.rows !== 'number') continue;
      out.push({ database: db.path, name: t.name, rows: t.rows });
    }
  }
  return out;
}

function databasesOf(scene: unknown): Set<string> {
  const out = new Set<string>();
  if (!isRecord(scene) || !Array.isArray(scene.databases)) return out;
  for (const db of scene.databases) if (isRecord(db) && typeof db.path === 'string') out.add(db.path);
  return out;
}

const STATUS_OF_KIND: Readonly<Record<string, EntryStatus>> = {
  'file-deleted': 'deleted',
  'file-created': 'created',
  'file-overwritten': 'changed',
  'symlink-changed': 'changed',
};

/** Host of a destination such as "https://setup-check.example" or "setup-check.example:443". */
function hostOf(destination: string): string {
  const noScheme = destination.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  return noScheme.split(/[/?#]/)[0] ?? noScheme;
}

export function buildStage(input: StageInput): StageModel {
  const beforeFiles = filesOf(input.before);
  const afterFiles = filesOf(input.after);
  const statusByPath = new Map<string, EntryStatus>();
  for (const c of input.changes) {
    const status = STATUS_OF_KIND[c.kind];
    if (status !== undefined && typeof c.path === 'string') statusByPath.set(c.path, status);
  }
  const secretPaths = new Set<string>();
  for (const e of input.events) if (e.kind === 'secret-read' && typeof e.path === 'string') secretPaths.add(e.path);
  const databases = new Set([...databasesOf(input.before), ...databasesOf(input.after)]);

  const byPath = new Map<string, { kind: 'file' | 'directory'; inReality: boolean }>();
  for (const f of beforeFiles) byPath.set(f.path, { kind: f.kind, inReality: true });
  for (const f of afterFiles) if (!byPath.has(f.path)) byPath.set(f.path, { kind: f.kind, inReality: false });
  const afterSet = new Set(afterFiles.map((f) => f.path));

  const entries: StageEntry[] = [...byPath.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, info]) => {
      const parts = path.split('/');
      let status = statusByPath.get(path) ?? 'same';
      if (status === 'same' && info.inReality && !afterSet.has(path)) status = 'deleted';
      if (status === 'same' && !info.inReality) status = 'created';
      return {
        path,
        name: parts[parts.length - 1] ?? path,
        depth: parts.length - 1,
        kind: info.kind,
        status,
        secretRead: secretPaths.has(path),
        database: databases.has(path),
        inReality: info.inReality,
      };
    });

  const beforeTables = tablesOf(input.before);
  const afterTables = tablesOf(input.after);
  const key = (t: { database: string; name: string }): string => `${t.database}::${t.name}`;
  const afterByKey = new Map(afterTables.map((t) => [key(t), t]));
  const droppedKeys = new Set<string>();
  for (const c of input.changes) {
    if (c.kind === 'sql-row-count' && c.dropped === true && typeof c.path === 'string' && typeof c.table === 'string') {
      droppedKeys.add(key({ database: c.path, name: c.table }));
    }
  }
  const tables: StageTable[] = beforeTables.map((t) => {
    const after = afterByKey.get(key(t));
    return {
      database: t.database,
      name: t.name,
      before: t.rows,
      after: after?.rows ?? 0,
      dropped: after === undefined || droppedKeys.has(key(t)),
    };
  });
  const beforeKeys = new Set(beforeTables.map(key));
  for (const t of afterTables) {
    if (!beforeKeys.has(key(t))) tables.push({ database: t.database, name: t.name, before: 0, after: t.rows, dropped: false });
  }

  const egress: StageEgress[] = [];
  const seen = new Set<string>();
  const attempts = input.events.filter((e) => e.kind === 'network-attempt' && typeof e.destination === 'string');
  for (const a of attempts) {
    const destination = a.destination ?? '';
    if (seen.has(destination)) continue;
    seen.add(destination);
    const secrets = input.events
      .filter((e) => e.kind === 'secret-read' && e.stepIndex === a.stepIndex && typeof e.path === 'string')
      .map((e) => e.path ?? '');
    egress.push({ destination, secrets: [...new Set(secrets)] });
  }
  if (attempts.length === 0) {
    for (const e of input.effects) {
      if (e.kind !== 'network') continue;
      const host = hostOf(e.destination);
      if (seen.has(host)) continue;
      seen.add(host);
      egress.push({ destination: e.destination, secrets: [] });
    }
  }

  const differences =
    entries.filter((e) => e.status !== 'same').length + tables.filter((t) => t.before !== t.after || t.dropped).length;
  return { entries, tables, egress, differences };
}

/** How many row bars stand for a row count: one per row up to eight, then eight. */
export function barsFor(rows: number): number {
  if (rows <= 0) return 0;
  return Math.min(8, Math.max(1, Math.round(rows)));
}

/** Bars left in the copy, in proportion to the rows left (at least one while a row is left). */
export function barsLeft(before: number, after: number): number {
  const total = barsFor(before);
  if (after <= 0 || before <= 0) return after > 0 ? barsFor(after) : 0;
  if (after >= before) return barsFor(after);
  return Math.max(1, Math.round((total * after) / before));
}
