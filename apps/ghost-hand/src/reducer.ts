// Pure app reducer (design "App shell"; requirements 12.7, 14.4-14.9).
// (state, event) -> state. The reducer never reads the clock: the time arrives in the
// `run-finished` event as epoch milliseconds, injected by the shell.

import { describeAction } from '@ghost-run/drawer-arm';
import type { GhostHandAction } from '@ghost-run/drawer-arm';
import type { GraveEntry } from '@ghost-run/ui';
import type { FileError, PlanFile } from './plan/plan-file';
import type { GhostRun } from './pipeline/types';
import { EXECUTE_STALE_ARM_TEXT, EXECUTE_STALE_SEED_TEXT } from './ui-text';

export const MAX_GRAVE_ENTRIES = 200;

export type Theme = 'dark' | 'light';

export interface AppState {
  readonly plan: PlanFile | null;
  readonly planError: readonly FileError[] | null;
  /** Identity string of the current plan (null when no plan is loaded). */
  readonly planIdentity: string | null;
  readonly seed: number;
  readonly theme: Theme;
  readonly running: boolean;
  /** Plan identity and explicit flag captured when the current run started. */
  readonly pendingRun: {
    readonly planIdentity: string;
    readonly explicit: boolean;
    readonly referenceEpoch: number;
    readonly seed: number;
  } | null;
  readonly lastRun: GhostRun | null;
  /** Plan identity of the plan that produced `lastRun`. */
  readonly lastRunPlanIdentity: string | null;
  /**
   * Counts the moves of the Reference_State: it grows by one on each reference execution and each
   * reset. A pass authorizes an execution only while the epoch equals the one it was rehearsed on.
   */
  readonly referenceEpoch: number;
  /** Reference epoch and seed that `lastRun` was rehearsed from (null before the first run). */
  readonly lastRunReferenceEpoch: number | null;
  readonly lastRunSeed: number | null;
  /** True after the reference arm executed the plan of `lastRun`. */
  readonly referenceExecuted: boolean;
  /** P2 comparison outcome of the last reference execution (null: none or not compared). */
  readonly p2Match: boolean | null;
  readonly graveyard: readonly GraveEntry[];
  /** Counter for the next entry id; keeps increasing after drops. */
  readonly nextGraveId: number;
  /** True once the oldest entry has been dropped (Req 14.9 text is shown). */
  readonly graveDropped: boolean;
  readonly openGraveId: string | null;
}

export type AppEvent =
  | { readonly type: 'plan-loaded'; readonly plan: PlanFile }
  | { readonly type: 'plan-error'; readonly errors: readonly FileError[] }
  | { readonly type: 'run-started'; readonly explicit: boolean }
  | { readonly type: 'run-finished'; readonly run: GhostRun; readonly nowMs: number }
  /** The run threw (for example an invalid plan): no result, no graveyard entry. */
  | { readonly type: 'run-aborted' }
  | { readonly type: 'plan-cleared' }
  | { readonly type: 'reference-executed'; readonly p2Match?: boolean | null }
  | { readonly type: 'reference-reset' }
  | { readonly type: 'seed-changed'; readonly seed: number }
  | { readonly type: 'theme-toggled' }
  | { readonly type: 'grave-opened'; readonly id: string }
  | { readonly type: 'grave-closed' };

export const INITIAL_STATE: AppState = {
  plan: null,
  planError: null,
  planIdentity: null,
  seed: 1,
  theme: 'dark',
  running: false,
  pendingRun: null,
  lastRun: null,
  lastRunPlanIdentity: null,
  referenceEpoch: 0,
  lastRunReferenceEpoch: null,
  lastRunSeed: null,
  referenceExecuted: false,
  p2Match: null,
  graveyard: [],
  nextGraveId: 1,
  graveDropped: false,
  openGraveId: null,
};

/** Identity string of a plan: its actions only (name, note and taskText do not matter). */
export function planIdentityOf(actions: readonly GhostHandAction[]): string {
  return JSON.stringify(actions);
}

/** `YYYY-MM-DDTHH:MM:SSZ` from epoch milliseconds (UTC, no milliseconds). */
export function formatRecordedAt(nowMs: number): string {
  return new Date(nowMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Req 12.7: Execute on reference arm is enabled only for a passing, unchanged plan that was
 * rehearsed from the current Reference_State and seed, and has not been used yet.
 */
export function canExecuteReference(state: AppState): boolean {
  return (
    state.lastRun !== null &&
    state.lastRun.verdict === 'pass' &&
    state.planIdentity !== null &&
    state.planIdentity === state.lastRunPlanIdentity &&
    state.lastRunReferenceEpoch === state.referenceEpoch &&
    state.lastRunSeed === state.seed &&
    !state.running
  );
}

/** Why Execute is off although the plan passed (null when it is enabled or there is no passing run). */
export function executeStaleReason(state: AppState): string | null {
  if (state.lastRun === null || state.lastRun.verdict !== 'pass' || state.running) return null;
  if (state.planIdentity === null || state.planIdentity !== state.lastRunPlanIdentity) return null;
  if (state.lastRunReferenceEpoch !== state.referenceEpoch) return EXECUTE_STALE_ARM_TEXT;
  if (state.lastRunSeed !== state.seed) return EXECUTE_STALE_SEED_TEXT;
  return null;
}

function distinctInOrder(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function wardIdsOf(run: GhostRun): string[] {
  return distinctInOrder(run.wardVerdict.violations.map((v) => v.wardId));
}

function makeEntry(state: AppState, run: GhostRun, nowMs: number): GraveEntry {
  const actions = state.plan?.actions ?? [];
  const labels = actions.map((a) => describeAction(a));
  return {
    id: `g-${state.nextGraveId}`,
    command: labels.join('; '),
    recordedAt: formatRecordedAt(nowMs),
    wardIds: wardIdsOf(run),
    detail: { wardVerdict: run.wardVerdict, claims: run.claims, actionLabels: labels },
  };
}

export function reducer(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case 'plan-loaded':
      return {
        ...state,
        plan: event.plan,
        planError: null,
        planIdentity: planIdentityOf(event.plan.actions),
        referenceExecuted: false,
        p2Match: null,
      };
    case 'plan-error':
      return { ...state, planError: event.errors };
    case 'run-started':
      if (state.planIdentity === null) return state;
      return {
        ...state,
        running: true,
        pendingRun: {
          planIdentity: state.planIdentity,
          explicit: event.explicit,
          referenceEpoch: state.referenceEpoch,
          seed: state.seed,
        },
        referenceExecuted: false,
        p2Match: null,
      };
    case 'run-finished': {
      const pending = state.pendingRun;
      const base: AppState = {
        ...state,
        running: false,
        pendingRun: null,
        lastRun: event.run,
        lastRunPlanIdentity: pending?.planIdentity ?? state.planIdentity,
        lastRunReferenceEpoch: pending?.referenceEpoch ?? state.referenceEpoch,
        lastRunSeed: pending?.seed ?? state.seed,
        referenceExecuted: false,
        p2Match: null,
      };
      if (!(pending?.explicit === true && event.run.verdict === 'block')) return base;
      const entry = makeEntry(state, event.run, event.nowMs);
      const full = state.graveyard.length >= MAX_GRAVE_ENTRIES;
      const kept = full ? state.graveyard.slice(1) : state.graveyard;
      return {
        ...base,
        graveyard: [...kept, entry],
        nextGraveId: state.nextGraveId + 1,
        graveDropped: state.graveDropped || full,
        openGraveId:
          state.openGraveId !== null && !kept.some((e) => e.id === state.openGraveId)
            ? null
            : state.openGraveId,
      };
    }
    case 'run-aborted':
      return { ...state, running: false, pendingRun: null };
    case 'plan-cleared':
      return {
        ...state,
        plan: null,
        planError: null,
        planIdentity: null,
        referenceExecuted: false,
        p2Match: null,
      };
    case 'reference-executed':
      // The arm moved whatever else changed while it ran, so the epoch always grows.
      if (!canExecuteReference(state)) return { ...state, referenceEpoch: state.referenceEpoch + 1 };
      return {
        ...state,
        referenceEpoch: state.referenceEpoch + 1,
        referenceExecuted: true,
        p2Match: event.p2Match ?? null,
      };
    case 'reference-reset':
      return { ...state, referenceEpoch: state.referenceEpoch + 1, referenceExecuted: false, p2Match: null };
    case 'seed-changed':
      return { ...state, seed: event.seed, referenceExecuted: false, p2Match: null };
    case 'theme-toggled':
      return { ...state, theme: state.theme === 'dark' ? 'light' : 'dark' };
    case 'grave-opened':
      return state.graveyard.some((e) => e.id === event.id)
        ? { ...state, openGraveId: event.id }
        : state;
    case 'grave-closed':
      return { ...state, openGraveId: null };
  }
}
