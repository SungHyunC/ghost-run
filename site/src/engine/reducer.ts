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
      const rows =
        reality.kind === 'shell' ? (reality.tables.find((t) => t.name === SHELL_TABLE)?.rows ?? 0) : 0;
      return { world: 'shell', usersBarsGone: 0, usersCount: rows, usersTag: '', usersClass: 'none', bakShown: false };
    }
    case 'hand': {
      const after = record.plan.copyAfter;
      const n = after.kind === 'hand' ? after.tiles.length : 0;
      return { world: 'hand', tiles: Array.from({ length: n }, () => 'idle' as const) };
    }
    case 'cloud': {
      const buckets = reality.kind === 'cloud' ? reality.buckets.map((b) => b.name) : [];
      buckets.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return { world: 'cloud', buckets: buckets.map((name) => ({ name, state: 'idle' as const })) };
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
    candleOut: false,
    stamp: 'none',
    note: NOTE_WAITING,
    badges: { fingerprint: false, go: false },
    narration: [],
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
      return { ...state, candleOut: event.out };
    case 'stamp':
      return { ...state, stamp: event.stamp };
    case 'note':
      return { ...state, note: event.text };
    case 'badges':
      return { ...state, badges: { fingerprint: event.fingerprint, go: event.go } };
    case 'act':
      return { ...state, act: event.act };
    case 'shellBar': {
      const c = state.copy;
      if (c.world !== 'shell') return state;
      return { ...state, copy: { ...c, usersBarsGone: Math.max(c.usersBarsGone, event.index + 1) } };
    }
    case 'shellUsers': {
      const c = state.copy;
      if (c.world !== 'shell') return state;
      return { ...state, copy: { ...c, usersClass: event.usersClass, usersTag: event.tag ?? c.usersTag } };
    }
    case 'shellCount': {
      const c = state.copy;
      if (c.world !== 'shell') return state;
      return { ...state, copy: { ...c, usersCount: event.value } };
    }
    case 'shellBak': {
      const c = state.copy;
      if (c.world !== 'shell') return state;
      return { ...state, copy: { ...c, bakShown: true } };
    }
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
