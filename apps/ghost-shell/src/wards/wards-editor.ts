// Wards editor: a pure reducer plus a description of the effects the shell must perform.
// The reducer reads no clock and starts no timer; the shell schedules the debounce through a TimerPort.
import type { WardSet } from '@ghost-run/core';
import type { TimerPort } from '@ghost-run/playground-shell';
import { formatConfigError, parseWards } from '@ghost-run/wards-config';
import type { ParseResult } from '@ghost-run/wards-config';
import type { PlaygroundRun } from '../pipeline/run-playground';
import { STALE_WARDS_TEXT } from '../texts';
import { escapeForDisplay } from '../ui-imports';
import defaultWardsText from '../../wards.yaml?raw';

export const DEBOUNCE_MS = 300;
export const MAX_SHOWN_ERRORS = 50;
export const MAX_WARDS_TEXT_BYTES = 262_144;
/** The bundled text that `Reset to default` restores. */
export const DEFAULT_WARDS_TEXT: string = defaultWardsText;

export interface WardsEditorState {
  readonly text: string;
  readonly parsed: ParseResult;
  /** Id of the latest requested run. */
  readonly runId: number;
  /** The run currently shown; it stays when the text does not parse. */
  readonly shown: PlaygroundRun | undefined;
  readonly stale: boolean;
}

export type WardsEditorEvent =
  | { readonly type: 'edit'; readonly text: string }
  | { readonly type: 'debounceElapsed' }
  | { readonly type: 'runFinished'; readonly runId: number; readonly run: PlaygroundRun }
  | { readonly type: 'reset' };

export type WardsEditorEffect =
  | { readonly type: 'cancelDebounce' }
  | { readonly type: 'scheduleDebounce'; readonly ms: number }
  /** Run the current plan with a world rebuilt for this WardSet. Never adds a Grave_Entry. */
  | { readonly type: 'runPlayground'; readonly runId: number; readonly wardSet: WardSet };

export interface WardsEditorStep {
  readonly state: WardsEditorState;
  readonly effects: readonly WardsEditorEffect[];
}

export function initialWardsEditorState(text: string = DEFAULT_WARDS_TEXT): WardsEditorState {
  return { text, parsed: parseWards(text), runId: 0, shown: undefined, stale: false };
}

/** Parses the current text; on success bumps the run id and requests a run. */
function settle(state: WardsEditorState, text: string): WardsEditorStep {
  const parsed = parseWards(text);
  if (!parsed.ok) {
    return { state: { ...state, text, parsed, stale: true }, effects: [] };
  }
  const runId = state.runId + 1;
  return {
    state: { ...state, text, parsed, runId, stale: false },
    effects: [{ type: 'runPlayground', runId, wardSet: parsed.wardSet }],
  };
}

export function wardsEditorReducer(state: WardsEditorState, event: WardsEditorEvent): WardsEditorStep {
  switch (event.type) {
    case 'edit':
      return {
        state: { ...state, text: event.text },
        effects: [{ type: 'cancelDebounce' }, { type: 'scheduleDebounce', ms: DEBOUNCE_MS }],
      };
    case 'debounceElapsed':
      return settle(state, state.text);
    case 'runFinished':
      if (event.runId !== state.runId) return { state, effects: [] };
      return { state: { ...state, shown: event.run }, effects: [] };
    case 'reset': {
      const step = settle(state, DEFAULT_WARDS_TEXT);
      return { state: step.state, effects: [{ type: 'cancelDebounce' }, ...step.effects] };
    }
  }
}

export interface WardsEditorErrorView {
  readonly label: typeof STALE_WARDS_TEXT | undefined;
  /** Escaped `formatConfigError` strings, at most 50. */
  readonly messages: readonly string[];
  /** 1-based line numbers to mark in the editor, in error order, without duplicates. */
  readonly lines: readonly number[];
}

export function wardsEditorErrors(state: WardsEditorState): WardsEditorErrorView {
  const label = state.stale ? STALE_WARDS_TEXT : undefined;
  if (state.parsed.ok) return { label, messages: [], lines: [] };
  const shown = state.parsed.errors.slice(0, MAX_SHOWN_ERRORS);
  const lines: number[] = [];
  for (const e of shown) {
    if (e.line !== undefined && !lines.includes(e.line)) lines.push(e.line);
  }
  return { label, messages: shown.map((e) => escapeForDisplay(formatConfigError(e))), lines };
}

/**
 * Shell wiring: performs the effects of the reducer through an injected TimerPort.
 * `runPlayground` is supplied by the page; it must resolve with the run for the given request.
 */
export function createWardsEditorShell(opts: {
  timers: TimerPort;
  initial?: WardsEditorState;
  runPlayground: (runId: number, wardSet: WardSet) => Promise<PlaygroundRun>;
  onChange?: (state: WardsEditorState) => void;
}): { getState(): WardsEditorState; dispatch(event: WardsEditorEvent): void } {
  let state = opts.initial ?? initialWardsEditorState();
  let handle: unknown;
  let pending = false;

  const dispatch = (event: WardsEditorEvent): void => {
    const step = wardsEditorReducer(state, event);
    state = step.state;
    for (const effect of step.effects) {
      if (effect.type === 'cancelDebounce') {
        if (pending) opts.timers.clearTimeout(handle);
        pending = false;
      } else if (effect.type === 'scheduleDebounce') {
        pending = true;
        handle = opts.timers.setTimeout(() => {
          pending = false;
          dispatch({ type: 'debounceElapsed' });
        }, effect.ms);
      } else {
        const { runId } = effect;
        void opts.runPlayground(runId, effect.wardSet).then(
          (run) => {
            dispatch({ type: 'runFinished', runId, run });
          },
          () => {
            // A failed run keeps the previous run; the page shows its own failure notice.
          },
        );
      }
    }
    opts.onChange?.(state);
  };

  return { getState: () => state, dispatch };
}
