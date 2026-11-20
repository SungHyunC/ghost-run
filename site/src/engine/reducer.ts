// The pure reducer of the walkthrough and the state before the first step.
// No clock, no random source, no handle on the Reality pane.

import type { WorldRecord } from '../data/types';
import type { CopyItemState, WalkEvent, WalkState } from './types';

/** The verdict note before step 4 (Requirement 11, criterion 12). */
export const NOTE_WAITING = 'The candle waits for the wards.';

/** The verdict note at the start of step 5. */
export const NOTE_RETRY = 'Trying the fixed plan on a fresh copy\u2026';

/** The `users` table of the Shell reality scene. */
export const SHELL_TABLE = 'users';

/** The items of the Copy pane before any step changes them. */
export function initialCopy(record: WorldRecord): CopyItemState {
  const { reality } = record;
  switch (record.id) {
    case 'shell': {
      if (reality.kind !== 'shell') return { world: 'shell', tables: [], entries: [] };
      return {
        world: 'shell',
        tables: reality.tables.map((t) => ({ name: t.name, bars: 0, count: t.rows, tag: '', cls: 'none' as const })),
        entries: reality.entries.map((e) => ({ ...e })),
      };
    }
    case 'hand': {
      const after = record.plan.copyAfter;
      const n = after.kind === 'hand' ? after.tiles.length : 0;
      return { world: 'hand', tiles: Array.from({ length: n }, () => 'idle' as const) };
    }
    case 'cloud': {
      const buckets = reality.kind === 'cloud' ? reality.buckets.map((b) => ({ name: b.name, objects: [...b.objects] })) : [];
      buckets.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return {
        world: 'cloud',
        buckets: buckets.map(({ name, objects }) => ({ name, state: 'idle' as const, tag: '', objects })),
      };
    }
  }
}

/** The state of a world right after its reset, before step 1 (`step` is -1). */
export function initialState(record: WorldRecord): WalkState {
  return {
    world: record.id,
    step: -1,
    act: 0,
    actorAt: 'gutter',
    copyVisible: false,
    copyEpoch: 0,
    beam: false,
    materialize: false,
    plan: { text: record.plan.display, rev: false },
    term: { visible: false, typed: '', caret: false },
    copy: initialCopy(record),
    checks: { rows: [], scan: false, tone: 'none', eoShown: false },
    candle: 'lit',
    stamp: 'none',
    note: NOTE_WAITING,
    badges: { fingerprint: false, go: false },
    narration: [],
    disabledSteps: 0,
  };
}

/** Applies one event to a state and returns a new state. Never mutates its input. */
export function reduceWalk(state: WalkState, event: WalkEvent): WalkState {
  switch (event.type) {
    case 'enter':
      return { ...state, step: event.step, act: event.act, actorAt: event.actorAt, narration: event.narration };
    case 'beam':
      return { ...state, beam: event.on };
    case 'copyShow':
      return { ...state, copyVisible: true, materialize: event.materialize };
    case 'recopy':
      return { ...state, copy: event.copy, copyEpoch: state.copyEpoch + 1, materialize: true };
    case 'plan':
      return { ...state, plan: { text: event.text, rev: event.rev } };
    case 'termShow':
      return { ...state, term: { visible: true, typed: '', caret: true } };
    case 'termType':
      return { ...state, term: { ...state.term, typed: event.typed } };
    case 'termHide':
      return { ...state, term: { visible: false, typed: '', caret: false } };
    case 'checksClear':
      return { ...state, checks: { rows: [], scan: event.scan, tone: 'none', eoShown: false } };
    case 'checkRow':
      return { ...state, checks: { ...state.checks, rows: [...state.checks.rows, event.row] } };
    case 'wardTone':
      return { ...state, checks: { ...state.checks, tone: event.tone, eoShown: true } };
    case 'candle':
      return { ...state, candle: event.state };
    case 'stamp':
      return { ...state, stamp: event.stamp };
    case 'note':
      return { ...state, note: event.text };
    case 'badges':
      return { ...state, badges: { fingerprint: event.fingerprint, go: event.go } };
    case 'act':
      return { ...state, act: event.act };
    case 'table': {
      const c = state.copy;
      if (c.world !== 'shell') return state;
      const tables = c.tables.map((t) =>
        t.name === event.name
          ? {
              ...t,
              bars: event.bars ?? t.bars,
              count: event.count ?? t.count,
              tag: event.tag ?? t.tag,
              cls: event.cls ?? t.cls,
            }
          : t,
      );
      return { ...state, copy: { ...c, tables } };
    }
    case 'entry': {
      const c = state.copy;
      if (c.world !== 'shell') return state;
      const known = c.entries.some((e) => e.name === event.name);
      const entries = known
        ? c.entries.map((e) => (e.name === event.name ? { ...e, state: event.state } : e))
        : [...c.entries, { name: event.name, kind: event.kind, state: event.state }];
      return { ...state, copy: { ...c, entries } };
    }
    case 'bucketTag': {
      const c = state.copy;
      if (c.world !== 'cloud') return state;
      const buckets = c.buckets.map((b) => (b.name === event.name ? { ...b, tag: event.tag } : b));
      return { ...state, copy: { ...c, buckets } };
    }
    case 'bucketObjects': {
      const c = state.copy;
      if (c.world !== 'cloud') return state;
      const buckets = c.buckets.map((b) => (b.name === event.name ? { ...b, objects: [...event.objects] } : b));
      return { ...state, copy: { ...c, buckets } };
    }
    case 'disable':
      return { ...state, disabledSteps: Math.max(0, Math.min(4, event.count)) };
    case 'handTile': {
      const c = state.copy;
      if (c.world !== 'hand' || event.index < 0 || event.index >= c.tiles.length) return state;
      const tiles = c.tiles.slice();
      tiles[event.index] = event.state;
      return { ...state, copy: { ...c, tiles } };
    }
    case 'cloudBucket': {
      const c = state.copy;
      if (c.world !== 'cloud') return state;
      const buckets = c.buckets.map((b) => (b.name === event.name ? { ...b, state: event.state } : b));
      return { ...state, copy: { ...c, buckets } };
    }
  }
}
