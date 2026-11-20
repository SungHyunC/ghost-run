// The timing table of the walkthrough as data: buildScript gives the timed events of one step,
// settle folds steps without time. Offsets are those of docs/design/landing-mockup.html.
// No clock, no random source.

import type { CopyScene, PlanRecord, WorldRecord } from '../data/types';
import { narration } from '../data/narration';
import { formatCount } from './format';
import { initialCopy, initialState, NOTE_RETRY, reduceWalk, SHELL_TABLE } from './reducer';
import type { Candle, Stamp, StepIndex, TimedEvent, WalkEvent, WalkState } from './types';

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

/** The note of step 5 when the plan has no fix: the visitor edits and runs again. */
export const NOTE_EDIT = 'Edit the plan above and run again.';

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

/** The note of a `warn` verdict (Requirement 7, criterion 9). Same for every world. */
export function warnNote(_record: WorldRecord): string {
  return 'Nothing runs for real until a human says yes.';
}

/** The note of a `block` verdict, from the facts of `plan` (the first plan, or the fixed plan when it blocks). */
export function blockNote(record: WorldRecord, plan: PlanRecord = record.plan): string {
  if (!plan.p1.equal) return 'The isolation check failed. Nothing runs for real.';
  switch (record.id) {
    case 'shell': {
      const rows =
        record.reality.kind === 'shell' ? (record.reality.tables.find((t) => t.name === SHELL_TABLE)?.rows ?? 0) : 0;
      const lost = plan.facts['rowsLost'];
      if (rows > 0 && typeof lost === 'number' && lost > 0) return `Reality still has all ${formatCount(rows)} users.`;
      return 'Reality still has all its files.';
    }
    case 'hand':
      return 'The real arm stays still.';
    case 'cloud': {
      const removed = plan.facts['removedBuckets'];
      return typeof removed === 'string' && removed !== '' ? `The real ${removed.split(',').join(', ')} is untouched.` : 'Reality is untouched.';
    }
  }
}

/** The candle, stamp, and note events of one verdict, at `at`. */
function verdictEvents(record: WorldRecord, plan: PlanRecord, at: number): TimedEvent[] {
  const [candle, stamp, note]: [Candle, Stamp, string] =
    plan.verdict === 'pass'
      ? ['lit', 'PASS', passNote(record)]
      : plan.verdict === 'warn'
        ? ['flicker', 'ASK A HUMAN', warnNote(record)]
        : ['out', 'BLOCKED', blockNote(record, plan)];
  return [
    { at, event: { type: 'candle', state: candle } },
    { at, event: { type: 'stamp', stamp } },
    { at, event: { type: 'note', text: note } },
  ];
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
    // The tone follows the live verdict: bad when any ward has a violation or any chip is a cross.
    event: { type: 'wardTone', tone: plan.violatedWardIds.length > 0 || plan.checks.some((c) => !c.ok) ? 'bad' : 'good' },
  });
  return out;
}

/**
 * Milliseconds per typed character in step 2. It is `TYPE_MS` (the verbatim mockup timing) whenever the typing,
 * the action delay, and the world action fit before step 3 starts. A longer text (a Visitor_Input of up to
 * 256 characters) types faster so that every event of step 2 still fires inside its slot: the nominal table
 * stays valid for any input and a play, a jump, and a settle agree. The Presets never reach the cap.
 */
export function typeMs(record: WorldRecord, length: number): number {
  if (length === 0) return TYPE_MS;
  const tail = runEvents(record, 0).reduce((m, e) => Math.max(m, e.at), 0);
  const room = DUR[1] - 1 - ACTION_DELAY_MS - tail;
  return Math.max(1, Math.min(TYPE_MS, Math.floor(room / length)));
}

function typeEvents(text: string, base: number, ms: number = TYPE_MS): TimedEvent[] {
  const out: TimedEvent[] = [];
  for (let i = 1; i <= text.length; i++) {
    out.push({ at: base + ms * i, event: { type: 'termType', typed: text.slice(0, i) } });
  }
  return out;
}

/** The Shell action of `plan` starting at `T`: tables that lose rows or vanish, entries that go or appear, soft deletes. */
function shellEvents(record: WorldRecord, plan: PlanRecord, T: number): TimedEvent[] {
  const out: TimedEvent[] = [];
  const after = plan.copyAfter;
  if (after.kind !== 'shell' || record.reality.kind !== 'shell') return out;
  const before = record.reality.tables;
  for (const table of after.tables) {
    const total = before.find((x) => x.name === table.name)?.rows ?? 0;
    const now = table.state === 'dropped' ? 0 : table.rows;
    if (table.state === 'soft') {
      out.push({ at: T + SHELL_SOFT_MS, event: { type: 'table', name: table.name, cls: 'soft', tag: table.note ?? '' } });
    } else if (now < total) {
      const barsAll = Math.min(12, Math.max(2, Math.round(total / 100)));
      const bars = table.state === 'dropped' ? barsAll : Math.max(1, Math.round((barsAll * (total - now)) / total));
      out.push({ at: T, event: { type: 'table', name: table.name, cls: 'poof' } });
      for (let k = 0; k < bars; k++) out.push({ at: T + SHELL_BAR_MS * k, event: { type: 'table', name: table.name, bars: k + 1 } });
      for (let k = 1; k <= SHELL_COUNT_STEPS; k++) {
        out.push({
          at: T + SHELL_BAR_MS * k,
          event: { type: 'table', name: table.name, count: Math.round(now + (total - now) * (1 - k / SHELL_COUNT_STEPS)) },
        });
      }
      if (table.state === 'dropped') {
        out.push({ at: T + SHELL_DROPPED_MS, event: { type: 'table', name: table.name, cls: 'dropped', tag: 'dropped' } });
      }
    }
  }
  for (const entry of after.entries) {
    if (entry.state !== 'intact') out.push({ at: T, event: { type: 'entry', name: entry.name, kind: entry.kind, state: entry.state } });
  }
  return out;
}

/** The Hand action of `plan` starting at `T`, one tile every `spacing` ms. */
function handEvents(plan: PlanRecord, T: number, spacing: number): TimedEvent[] {
  const tiles = plan.copyAfter.kind === 'hand' ? plan.copyAfter.tiles : [];
  return tiles.map((tile, k) => ({
    at: T + spacing * k,
    event: { type: 'handTile', index: k, state: tile.outcome === 'failed' ? 'fail' : 'ok' } as const,
  }));
}

/** The Cloud action of `plan` starting at `T`: buckets that vanish, tags of a changed ACL or public-access block. */
function cloudEvents(record: WorldRecord, plan: PlanRecord, T: number): TimedEvent[] {
  const out: TimedEvent[] = [];
  const after = plan.copyAfter;
  for (const name of vanishing(record, after)) {
    out.push({ at: T, event: { type: 'cloudBucket', name, state: 'poof' } });
    out.push({ at: T + CLOUD_VANISH_MS, event: { type: 'cloudBucket', name, state: 'vanish' } });
  }
  if (after.kind === 'cloud') {
    for (const bucket of after.buckets) {
      // Objects that the run deleted from a bucket that stays: the copy drops them with the run.
      const was = record.reality.kind === 'cloud' ? record.reality.buckets.find((x) => x.name === bucket.name) : undefined;
      if (was !== undefined && was.objects.some((o) => !bucket.objects.includes(o))) {
        out.push({ at: T, event: { type: 'bucketObjects', name: bucket.name, objects: bucket.objects } });
      }
      if (bucket.tag !== undefined) out.push({ at: T, event: { type: 'bucketTag', name: bucket.name, tag: bucket.tag } });
    }
  }
  return out;
}

/** The world action of the first plan, starting at T. */
function runEvents(record: WorldRecord, T: number): TimedEvent[] {
  if (record.id === 'shell') return shellEvents(record, record.plan, T);
  if (record.id === 'hand') return handEvents(record.plan, T, HAND_RUN_MS);
  return cloudEvents(record, record.plan, T);
}

/** The world action of the fixed plan, starting at T2. */
function fixEvents(record: WorldRecord, fixedPlan: PlanRecord, T2: number): TimedEvent[] {
  if (record.id === 'shell') return shellEvents(record, fixedPlan, T2);
  if (record.id === 'hand') return handEvents(fixedPlan, T2, HAND_FIX_MS);
  return cloudEvents(record, fixedPlan, T2);
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

/** Step 5 by Outcome (design, Component 7). `unsupported` never gets here. */
function lastStep(record: WorldRecord): TimedEvent[] {
  const { plan } = record;
  switch (record.outcome) {
    case 'block-open':
      return [
        { at: 0, event: enter(record, 4) },
        { at: 0, event: { type: 'note', text: NOTE_EDIT } },
      ];
    case 'pass':
      return [
        { at: 0, event: enter(record, 4) },
        { at: 0, event: { type: 'badges', fingerprint: false, go: plan.verdict === 'pass' && plan.p1.equal } },
        { at: 0, event: { type: 'act', act: 5 } },
      ];
    case 'warn':
      return [
        { at: 0, event: enter(record, 4) },
        { at: 0, event: { type: 'note', text: warnNote(record) } },
      ];
    case 'unsupported':
      return [];
    case 'block-fixed': {
      const fixedPlan = record.fixed ?? plan;
      const text = fixedPlan.display;
      const T2 = FIX_TYPE_START_MS + TYPE_MS * text.length + ACTION_DELAY_MS;
      const T3 = T2 + FIX_CHECKS_MS;
      const end = T3 + FIX_PASS_MS;
      const passes = fixedPlan.verdict === 'pass' && fixedPlan.p1.equal;
      return [
        { at: 0, event: enter(record, 4) },
        { at: 0, event: { type: 'plan', text, rev: true } },
        { at: 0, event: { type: 'badges', fingerprint: false, go: false } },
        { at: 0, event: { type: 'candle', state: 'out' } },
        { at: 0, event: { type: 'stamp', stamp: 'none' } },
        { at: 0, event: { type: 'note', text: NOTE_RETRY } },
        { at: 0, event: { type: 'checksClear', scan: false } },
        { at: 0, event: { type: 'recopy', copy: initialCopy(record) } },
        { at: 0, event: { type: 'beam', on: true } },
        { at: FIX_TYPE_START_MS, event: { type: 'beam', on: false } },
        { at: FIX_TYPE_START_MS, event: { type: 'termShow' } },
        ...typeEvents(text, FIX_TYPE_START_MS),
        ...fixEvents(record, fixedPlan, T2),
        { at: T3, event: { type: 'termHide' } },
        { at: T3, event: { type: 'checksClear', scan: true } },
        ...checkEvents(fixedPlan, T3),
        ...verdictEvents(record, fixedPlan, end),
        { at: end, event: { type: 'badges', fingerprint: false, go: passes } },
        { at: end, event: { type: 'act', act: passes ? 5 : 4 } },
      ];
    }
  }
}

/**
 * The timed events of one step; `at` is in ms after the start of that step. Sorted by `at`, stable.
 * An `unsupported` record plays step 1 and then nothing: it has `disabledSteps = 4` and no later event.
 */
export function buildScript(record: WorldRecord, step: number): TimedEvent[] {
  if (record.outcome === 'unsupported' && step > 0 && step <= 4) return [];
  let out: TimedEvent[];
  switch (step) {
    case 0:
      out = [
        { at: 0, event: enter(record, 0) },
        { at: 0, event: { type: 'beam', on: true } },
        { at: 0, event: { type: 'copyShow', materialize: true } },
        { at: BEAM_OFF_MS, event: { type: 'beam', on: false } },
        ...(record.outcome === 'unsupported' ? [{ at: 0, event: { type: 'disable', count: 4 } } as TimedEvent] : []),
      ];
      break;
    case 1: {
      const text = record.plan.display;
      const ms = typeMs(record, text.length);
      const T = ms * text.length + ACTION_DELAY_MS;
      out = [
        { at: 0, event: enter(record, 1) },
        { at: 0, event: { type: 'beam', on: false } },
        { at: 0, event: { type: 'termShow' } },
        ...typeEvents(text, 0, ms),
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
        ...verdictEvents(record, record.plan, VERDICT_MS),
        { at: VERDICT_MS, event: { type: 'badges', fingerprint: record.plan.p1.equal, go: false } },
      ];
      break;
    case 4:
      out = lastStep(record);
      break;
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
  const last = Math.min(upTo, record.outcome === 'unsupported' ? 0 : 4);
  for (let step = 0; step <= last; step++) {
    for (const { event } of buildScript(record, step)) state = reduceWalk(state, event);
  }
  if (last >= 0) state = { ...state, narration: narration(record, last) };
  return state;
}
