// The record-driven walk hook: owns the state, the one timer registry, and the controls.
// It knows no engine and no preset: the caller hands it a WorldRecord with `show`.
// The engine never reads the clock; every timer goes through the injected Scheduler.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorldId } from '../config';
import type { WorldRecord } from '../data/types';
import { initialState, reduceWalk } from './reducer';
import { defaultScheduler, type Scheduler } from './scheduler';
import { buildScript, settle, STEP_START } from './script';
import type { WalkEvent, WalkState, WalkView } from './types';
import { useReducedMotion } from './useReducedMotion';

const LAST_STEP = 4;

export interface WalkControls {
  /** Resets and plays `record` (or shows its final state under Reduced_Motion). Cancels any earlier run. */
  show: (record: WorldRecord) => void;
  /** Plays the displayed record again from the reset state. */
  replay: () => void;
  /** `n` is the 0-based step index (0 to 4). A step the record cannot reach is ignored. */
  jump: (n: number) => void;
  /** Stops the run that is animating and shows the displayed record at its reset state. */
  cancel: () => void;
}

export interface Walk {
  view: WalkView;
  /** The record the view is built from. */
  record: WorldRecord;
  world: WorldId;
  /** -1 before the first step. */
  step: WalkState['step'];
  /** True while at least one timer of a run is pending. */
  animating: boolean;
  controls: WalkControls;
}

export interface UseWalkOptions {
  /** The record shown (at its reset state) before the first `show`. */
  initial: WorldRecord;
  /** Timer functions; defaults to the globals. */
  scheduler?: Scheduler;
  /** When true the first render already holds the final state of `initial` and no timer runs. */
  settled?: boolean;
}

/** The Cloud world has its own line when nothing leaves: it names the flag that would let something leave. */
const NOTHING_LEAVES: Record<WorldId, string> = {
  shell: 'nothing leaves the box',
  hand: 'nothing leaves the box',
  cloud: 'no --endpoint-url, so nothing leaves',
};

export function effectsText(record: WorldRecord, state: WalkState): string {
  const plan = state.plan.rev ? (record.fixed ?? record.plan) : record.plan;
  return plan.effectsOutside.length === 0 ? NOTHING_LEAVES[record.id] : plan.effectsOutside.join(', ');
}

/** The number of steps a record cannot reach (4 for `unsupported`). */
function unreachable(record: WorldRecord): number {
  return record.outcome === 'unsupported' ? 4 : 0;
}

/**
 * The record-driven hook. Under Reduced_Motion `show` and `jump` set the final (or settled) state at once and no
 * timer is ever set; turning Reduced_Motion on mid-walk cancels the timers and shows the final state.
 * Unmount (or a new scheduler) leaves no pending timer.
 */
export function useWalk({ initial, scheduler = defaultScheduler, settled = false }: UseWalkOptions): Walk {
  const reduced = useReducedMotion();
  const ids = useRef<number[]>([]);
  const pending = useRef(0);
  const [animating, setAnimating] = useState(false);
  const recordRef = useRef<WorldRecord>(initial);
  const [record, setRecord] = useState<WorldRecord>(initial);

  const [state, setState] = useState<WalkState>(() =>
    settled ? settle(initial, LAST_STEP) : initialState(initial),
  );

  const cancelAll = useCallback(() => {
    for (const id of ids.current) scheduler.clearTimeout(id);
    ids.current = [];
    pending.current = 0;
    setAnimating(false);
  }, [scheduler]);

  const schedule = useCallback(
    (rec: WorldRecord, from: number, to: number) => {
      const base = STEP_START[from] ?? 0;
      for (let k = from; k <= to; k++) {
        const start = (STEP_START[k] ?? 0) - base;
        for (const { at, event } of buildScript(rec, k)) {
          pending.current++;
          ids.current.push(
            scheduler.setTimeout(() => {
              pending.current--;
              setState((s) => reduceWalk(s, event as WalkEvent));
              if (pending.current <= 0) setAnimating(false);
            }, start + at),
          );
        }
      }
      if (pending.current > 0) setAnimating(true);
    },
    [scheduler],
  );

  const show = useCallback(
    (rec: WorldRecord) => {
      cancelAll();
      recordRef.current = rec;
      setRecord(rec);
      if (reduced) {
        setState(settle(rec, LAST_STEP));
        return;
      }
      setState(initialState(rec));
      schedule(rec, 0, LAST_STEP);
    },
    [cancelAll, reduced, schedule],
  );

  const replay = useCallback(() => {
    show(recordRef.current);
  }, [show]);

  const jump = useCallback(
    (n: number) => {
      const rec = recordRef.current;
      const step = Math.max(0, Math.min(LAST_STEP, Math.trunc(n)));
      if (step > LAST_STEP - unreachable(rec)) return;
      cancelAll();
      if (reduced) {
        setState(settle(rec, step));
        return;
      }
      setState(settle(rec, step - 1));
      schedule(rec, step, step);
    },
    [cancelAll, reduced, schedule],
  );

  const cancel = useCallback(() => {
    cancelAll();
    setState(initialState(recordRef.current));
  }, [cancelAll]);

  // Reduced_Motion turning on mid-walk: cancel the timers and show the final state.
  useEffect(() => {
    if (!reduced) return;
    cancelAll();
    setState(settle(recordRef.current, LAST_STEP));
  }, [reduced, cancelAll]);

  // Unmount (or a new scheduler): no pending timer is left.
  useEffect(() => cancelAll, [cancelAll]);

  const view = useMemo<WalkView>(
    () => ({
      ...state,
      ward: { id: record.ward.id, effectsOutside: effectsText(record, state) },
    }),
    [state, record],
  );

  return { view, record, world: state.world, step: state.step, animating, controls: { show, replay, jump, cancel } };
}
