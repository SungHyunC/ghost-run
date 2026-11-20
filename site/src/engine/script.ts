// The timing table of the walkthrough as data: buildScript gives the timed events of one step,
// settle folds steps without time. Offsets are those of docs/design/landing-mockup.html.
// No clock, no random source.

import type { CopyScene, PlanRecord, WorldRecord } from '../data/types';
import { narration } from '../data/narration';
import { formatCount } from './format';
import { initialCopy, initialState, NOTE_RETRY, reduceWalk, SHELL_TABLE } from './reducer';
import type { StepIndex, TimedEvent, WalkEvent, WalkState } from './types';

/** Nominal duration of each step, in ms. Step k starts at the sum of the entries before it. */
export const DUR = [2700, 3900, 3300, 2700, 5200] as const;

/** Milliseconds per typed character. */
export const TYPE_MS = 26;

/** Delay between the last typed character and the world action. */
export const ACTION_DELAY_MS = 250;

/** Start time of each step in a full play. */
export const STEP_START: readonly number[] = DUR.map((_, k) => DUR.slice(0, k).reduce((a, d) => a + d, 0));

const SHELL_BAR_MS = 70;
const SHELL_COUNT_STEPS = 12;
const SHELL_DROPPED_MS = 850;
const SHELL_SOFT_MS = 500;
const HAND_RUN_MS = 160;
const HAND_FIX_MS = 120;
const CLOUD_VANISH_MS = 300;
const BEAM_OFF_MS = 1900;
const CHECK_FIRST_MS = 500;
const CHECK_ROW_MS = 380;
const TONE_FIRST_MS = 600;
const VERDICT_MS = 500;
const FIX_TYPE_START_MS = 1000;
const FIX_CHECKS_MS = 900;
const FIX_PASS_MS = 1500;

/** The verdict notes of Requirement 11, criterion 12 that depend on the world. */
export function passNote(record: WorldRecord): string {
  switch (record.id) {
    case 'shell':
      return 'The real run is allowed.';
    case 'hand':
      return 'The real arm may move now.';
    case 'cloud':
      return 'Allowed. Ghost Cloud has no real mode yet.';
  }
}

export function blockNote(record: WorldRecord): string {
  switch (record.id) {
    case 'shell': {
      const rows =
        record.reality.kind === 'shell' ? (record.reality.tables.find((t) => t.name === SHELL_TABLE)?.rows ?? 0) : 0;
      return `Reality still has all ${formatCount(rows)} users.`;
    }
    case 'hand':
      return 'The real arm stays still.';
    case 'cloud':
      return `The real ${String(record.plan.facts['removedBuckets'])} is untouched.`;
  }
}

/** The badge texts of the Reality pane head, by world (the engine only holds booleans). */
export function goBadge(record: WorldRecord): string {
  switch (record.id) {
    case 'shell':
      return 'real run allowed \u2713';
    case 'hand':
      return 'real arm may move \u2713';
    case 'cloud':
      return 'allowed \u2713';
  }
}

/** Names of the Cloud buckets that are in Reality but not in the copy after a run. */
function vanishing(record: WorldRecord, after: CopyScene): string[] {
  if (record.reality.kind !== 'cloud' || after.kind !== 'cloud') return [];
  const kept = new Set(after.buckets.map((b) => b.name));
  return record.reality.buckets
    .map((b) => b.name)
    .filter((n) => !kept.has(n))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function checkEvents(plan: PlanRecord, base: number): TimedEvent[] {
  const out: TimedEvent[] = plan.checks.map((row, k) => ({
    at: base + CHECK_FIRST_MS + CHECK_ROW_MS * k,
    event: { type: 'checkRow', row },
  }));
  out.push({
    at: base + TONE_FIRST_MS + CHECK_ROW_MS * plan.checks.length,
    event: { type: 'wardTone', tone: plan.checks.every((c) => c.ok) ? 'good' : 'bad' },
  });
  return out;
}

function typeEvents(text: string, base: number): TimedEvent[] {
  const out: TimedEvent[] = [];
  for (let i = 1; i <= text.length; i++) {
    out.push({ at: base + TYPE_MS * i, event: { type: 'termType', typed: text.slice(0, i) } });
  }
  return out;
}

/** The world action of the demo plan, starting at T. */
function runEvents(record: WorldRecord, T: number): TimedEvent[] {
  const out: TimedEvent[] = [];
  const after = record.plan.copyAfter;
  if (record.id === 'shell') {
    const rows = initialCopy(record);
    const total = rows.world === 'shell' ? rows.usersCount : 0;
    const bars = Math.min(12, Math.max(2, Math.round(total / 100)));
    out.push({ at: T, event: { type: 'shellUsers', usersClass: 'poof' } });
    for (let k = 0; k < bars; k++) out.push({ at: T + SHELL_BAR_MS * k, event: { type: 'shellBar', index: k } });
    for (let k = 1; k <= SHELL_COUNT_STEPS; k++) {
      out.push({
        at: T + SHELL_BAR_MS * k,
        event: { type: 'shellCount', value: Math.round(total * (1 - k / SHELL_COUNT_STEPS)) },
      });
    }
    out.push({ at: T + SHELL_DROPPED_MS, event: { type: 'shellUsers', usersClass: 'dropped', tag: 'dropped' } });
  } else if (record.id === 'hand') {
    const tiles = after.kind === 'hand' ? after.tiles : [];
    tiles.forEach((tile, k) => {
      out.push({
        at: T + HAND_RUN_MS * k,
        event: { type: 'handTile', index: k, state: tile.outcome === 'failed' ? 'fail' : 'ok' },
      });
    });
  } else {
    for (const name of vanishing(record, after)) {
      out.push({ at: T, event: { type: 'cloudBucket', name, state: 'poof' } });
      out.push({ at: T + CLOUD_VANISH_MS, event: { type: 'cloudBucket', name, state: 'vanish' } });
    }
  }
  return out;
}

/** The world action of the fixed plan, starting at T2. */
function fixEvents(record: WorldRecord, T2: number): TimedEvent[] {
  const out: TimedEvent[] = [];
  const after = record.fixed.copyAfter;
  if (record.id === 'shell') {
    const users = after.kind === 'shell' ? after.tables.find((t) => t.name === SHELL_TABLE) : undefined;
    out.push({ at: T2, event: { type: 'shellBak' } });
    out.push({
      at: T2 + SHELL_SOFT_MS,
      event: { type: 'shellUsers', usersClass: 'soft', tag: users?.note ?? '' },
    });
  } else if (record.id === 'hand') {
    const tiles = after.kind === 'hand' ? after.tiles : [];
    tiles.forEach((_, k) => {
      out.push({ at: T2 + HAND_FIX_MS * k, event: { type: 'handTile', index: k, state: 'ok' } });
    });
  } else {
    for (const name of vanishing(record, after)) {
      out.push({ at: T2, event: { type: 'cloudBucket', name, state: 'poof' } });
      out.push({ at: T2 + CLOUD_VANISH_MS, event: { type: 'cloudBucket', name, state: 'vanish' } });
    }
  }
  return out;
}

function enter(record: WorldRecord, step: StepIndex): WalkEvent {
  return {
    type: 'enter',
    step,
    act: step,
    actorAt: step === 0 ? 'gutter' : step === 2 ? 'ward' : step === 3 ? 'verdict' : 'copy',
    narration: narration(record, step),
  };
}

/** The timed events of one step; `at` is in ms after the start of that step. Sorted by `at`, stable. */
export function buildScript(record: WorldRecord, step: number): TimedEvent[] {
  let out: TimedEvent[];
  switch (step) {
    case 0:
      out = [
        { at: 0, event: enter(record, 0) },
        { at: 0, event: { type: 'beam', on: true } },
        { at: 0, event: { type: 'copyShow', materialize: true } },
        { at: BEAM_OFF_MS, event: { type: 'beam', on: false } },
      ];
      break;
    case 1: {
      const text = record.plan.display;
      const T = TYPE_MS * text.length + ACTION_DELAY_MS;
      out = [
        { at: 0, event: enter(record, 1) },
        { at: 0, event: { type: 'beam', on: false } },
        { at: 0, event: { type: 'termShow' } },
        ...typeEvents(text, 0),
        ...runEvents(record, T),
      ];
      break;
    }
    case 2:
      out = [
        { at: 0, event: enter(record, 2) },
        { at: 0, event: { type: 'termHide' } },
        { at: 0, event: { type: 'checksClear', scan: true } },
        ...checkEvents(record.plan, 0),
      ];
      break;
    case 3:
      out = [
        { at: 0, event: enter(record, 3) },
        { at: VERDICT_MS, event: { type: 'candle', out: true } },
        { at: VERDICT_MS, event: { type: 'stamp', stamp: 'BLOCKED' } },
        { at: VERDICT_MS, event: { type: 'note', text: blockNote(record) } },
        { at: VERDICT_MS, event: { type: 'badges', fingerprint: record.plan.p1.equal, go: false } },
      ];
      break;
    case 4: {
      const text = record.fixed.display;
      const T2 = FIX_TYPE_START_MS + TYPE_MS * text.length + ACTION_DELAY_MS;
      const T3 = T2 + FIX_CHECKS_MS;
      out = [
        { at: 0, event: enter(record, 4) },
        { at: 0, event: { type: 'plan', text, rev: true } },
        { at: 0, event: { type: 'badges', fingerprint: false, go: false } },
        { at: 0, event: { type: 'candle', out: true } },
        { at: 0, event: { type: 'stamp', stamp: 'none' } },
        { at: 0, event: { type: 'note', text: NOTE_RETRY } },
        { at: 0, event: { type: 'checksClear', scan: false } },
        { at: 0, event: { type: 'recopy', copy: initialCopy(record) } },
        { at: 0, event: { type: 'beam', on: true } },
        { at: FIX_TYPE_START_MS, event: { type: 'beam', on: false } },
        { at: FIX_TYPE_START_MS, event: { type: 'termShow' } },
        ...typeEvents(text, FIX_TYPE_START_MS),
        ...fixEvents(record, T2),
        { at: T3, event: { type: 'termHide' } },
        { at: T3, event: { type: 'checksClear', scan: true } },
        ...checkEvents(record.fixed, T3),
        { at: T3 + FIX_PASS_MS, event: { type: 'candle', out: false } },
        { at: T3 + FIX_PASS_MS, event: { type: 'stamp', stamp: 'PASS' } },
        { at: T3 + FIX_PASS_MS, event: { type: 'note', text: passNote(record) } },
        {
          at: T3 + FIX_PASS_MS,
          event: { type: 'badges', fingerprint: false, go: record.fixed.verdict === 'pass' && record.fixed.p1.equal },
        },
        { at: T3 + FIX_PASS_MS, event: { type: 'act', act: 5 } },
      ];
      break;
    }
    default:
      throw new Error(`No script for step ${step}`);
  }
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
    .map(({ e }) => e);
}

/**
 * The state after steps 0 to `upTo`, applied instantly. Events are folded in `at` order and their times
 * are ignored; typing and the count-down therefore end at their final values. The narration is that of
 * step `upTo` only. `upTo < 0` gives the state after the reset.
 */
export function settle(record: WorldRecord, upTo: number): WalkState {
  let state = initialState(record);
  const last = Math.min(upTo, 4);
  for (let step = 0; step <= last; step++) {
    for (const { event } of buildScript(record, step)) state = reduceWalk(state, event);
  }
  if (last >= 0) state = { ...state, narration: narration(record, last) };
  return state;
}
