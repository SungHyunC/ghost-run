// Plan_Record derivation for Ghost Shell. Shared by the adapter and the record script.
// Pure: structural inputs only, no engine import, no I/O. It never reads file contents, so the
// `.env` value of the fixture cannot reach a record.

import type { CheckRow, CopyScene, PlanRecord, RealityScene, ShellEntry } from '../../data/types';
import { formatCount } from '../../engine/format';
import { atMostRow, destinations, extraChips, violatedIds, violationsOf } from './common';
import type { ObservedEventLike, ViolationLike } from './common';

/** The part of the world's scene that the derivation reads. */
export interface ShellSceneLike {
  files: readonly { path: string; type: string }[];
  databases: readonly { path: string; tables: readonly { name: string; rows: number }[] }[];
}

/** The headline ward: the first `sql` ward of the wards file. */
export interface ShellWardLike {
  id: string;
  tables: readonly string[];
  maxRowsLost: number;
}

/** Characters of the SET text kept in the tag of a soft-deleted table. */
const NOTE_LIMIT = 24;
const DB = 'app.db';

/** Glob to RegExp for one path segment: `*` matches any run of characters, `?` one character. */
function segmentPattern(seg: string): RegExp {
  let re = '';
  for (const ch of seg) {
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[\\^$.|+()[\]{}]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Does a secret pattern (for example `.env` or `**\/*.pem`) match a top-level name? */
export function matchesSecret(name: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => {
    const last = p.split('/').pop() ?? p;
    return segmentPattern(last).test(name);
  });
}

function compareNames(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Non-hidden top-level entries without secret-pattern matches, sorted case-insensitively. */
export function topLevelEntries(scene: ShellSceneLike, secretPatterns: readonly string[]): ShellEntry[] {
  const out: ShellEntry[] = [];
  for (const f of scene.files) {
    if (f.path.includes('/') || f.path.startsWith('.')) continue;
    if (matchesSecret(f.path, secretPatterns)) continue;
    out.push({ name: f.path, kind: f.type === 'directory' ? 'dir' : 'file', state: 'intact' });
  }
  return out.sort((a, b) => compareNames(a.name, b.name));
}

function tableRows(scene: ShellSceneLike): Map<string, number> {
  const rows = new Map<string, number>();
  for (const d of scene.databases) {
    if (d.path !== DB) continue;
    for (const t of d.tables) rows.set(t.name, t.rows);
  }
  return rows;
}

function shortened(text: string, limit: number): string {
  const cps = [...text];
  return cps.length <= limit ? text : `${cps.slice(0, limit - 1).join('')}\u2026`;
}

/** The kind line of the ward card. */
export function shellWardLine(ward: ShellWardLike): string {
  return `kind: sql \u00B7 tables: ${ward.tables.join(', ')}`;
}

/** The Reality pane: the tables of the ward and the visible top-level entries, before the run. */
export function shellReality(before: ShellSceneLike, ward: ShellWardLike, secretPatterns: readonly string[]): RealityScene {
  const rows = tableRows(before);
  const entries = topLevelEntries(before, secretPatterns);
  return {
    kind: 'shell',
    root: 'project/',
    tables: ward.tables.flatMap((name) => {
      const n = rows.get(name);
      return n === undefined ? [] : [{ name, rows: n }];
    }),
    entries,
  };
}

export interface ShellPlanInput {
  commands: readonly string[];
  verdict: 'pass' | 'warn' | 'block';
  violations: readonly ViolationLike[];
  ward: ShellWardLike;
  secretPatterns: readonly string[];
  before: ShellSceneLike;
  after: ShellSceneLike;
  /** `effectsOutside` of the report: one list per step. */
  effects: readonly (readonly { destination: string }[])[];
  observedEvents: readonly ObservedEventLike[];
  p1: { before: string; after: string };
  message: string;
}

/** The Plan_Record of one Ghost Shell run. */
export function shellPlanRecord(input: ShellPlanInput): PlanRecord {
  const { ward, before, after } = input;
  const rowsBefore = tableRows(before);
  const rowsAfter = tableRows(after);

  // A table that keeps its rows but is the target of an UPDATE is a soft delete ("deleted_at = 1").
  const update = /UPDATE\s+(\w+)\s+SET\s+([^;"']+)/i.exec(input.commands.join(' '));
  type ShellTable = Extract<CopyScene, { kind: 'shell' }>['tables'][number];
  const tables = ward.tables.flatMap((name): ShellTable[] => {
    const was = rowsBefore.get(name);
    if (was === undefined) return [];
    const now = rowsAfter.get(name);
    if (now === undefined) return [{ name, rows: 0, state: 'dropped' }];
    if (update?.[1] === name) {
      return [{ name, rows: now, state: 'soft', note: shortened((update[2] ?? '').trim(), NOTE_LIMIT) }];
    }
    return [{ name, rows: now, state: 'intact' }];
  });

  let rowsLost = 0;
  const lostByTable: string[] = [];
  for (const name of ward.tables) {
    const was = rowsBefore.get(name) ?? 0;
    const lost = Math.max(0, was - (rowsAfter.get(name) ?? 0));
    rowsLost += lost;
    if (lost > 0) lostByTable.push(`${formatCount(lost)} from ${name}`);
  }
  // The chip is a cross exactly when the headline ward has a violation in this run.
  const headline = atMostRow('rows lost', ward.maxRowsLost, rowsLost, lostByTable.length > 0 ? lostByTable.join(', ') : '0');
  const checks: CheckRow[] = [{ ...headline, ok: violationsOf(input.violations, ward.id).length === 0 }];
  for (const chip of extraChips(input.violations, ward.id)) checks.push({ label: chip.wardId, measured: chip.text, ok: false });

  // Entries after the run: those of the first scene with their fate, then the new ones.
  const entriesBefore = topLevelEntries(before, input.secretPatterns);
  const entriesAfter = topLevelEntries(after, input.secretPatterns);
  const nowNames = new Set(entriesAfter.map((e) => e.name));
  const wasNames = new Set(entriesBefore.map((e) => e.name));
  const entries: ShellEntry[] = [
    ...entriesBefore.map((e): ShellEntry => ({ ...e, state: nowNames.has(e.name) ? 'intact' : 'gone' })),
    ...entriesAfter.filter((e) => !wasNames.has(e.name)).map((e): ShellEntry => ({ ...e, state: 'new' })),
  ].sort((a, b) => compareNames(a.name, b.name));

  const networkAttempts = input.observedEvents.filter((e) => e.kind === 'network-attempt').length;

  return {
    commands: [...input.commands],
    display: input.commands.join(' && '),
    verdict: input.verdict,
    violatedWardIds: violatedIds(input.violations),
    checks,
    effectsOutside: destinations(input.effects, input.observedEvents),
    p1: { equal: input.p1.before === input.p1.after, before: input.p1.before, after: input.p1.after },
    copyAfter: {
      kind: 'shell',
      tables,
      entries,
    },
    facts: {
      rowsLost,
      entriesGone: entries.filter((e) => e.state === 'gone').length,
      entriesNew: entries.filter((e) => e.state === 'new').length,
      networkAttempts,
    },
    message: input.message,
  };
}
