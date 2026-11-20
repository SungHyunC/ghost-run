// The walkthrough hook: owns the state, the one timer registry, and the controls.
// The engine never reads the clock; every timer goes through the injected Scheduler.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorldId } from '../config';
import type { RunsFile, WorldRecord } from '../data/types';
import { initialState, reduceWalk } from './reducer';
import { defaultScheduler, type Scheduler } from './scheduler';
import { buildScript, settle, STEP_START } from './script';
import type { WalkEvent, WalkState, WalkView } from './types';
import type { InViewState } from './useInView';
import { useReducedMotion } from './useReducedMotion';

const LAST_STEP = 4;

export interface WalkthroughControls {
  pickWorld: (world: WorldId) => void;
  replay: () => void;
  /** `n` is the 0-based step index (0 to 4). */
  jump: (n: number) => void;
}

export interface Walkthrough {
  view: WalkView;
  world: WorldId;
  /** -1 before the first step. */
  step: WalkState['step'];
  controls: WalkthroughControls;
}

/** The Cloud world has its own line when nothing leaves: it names the flag that would let something leave. */
const NOTHING_LEAVES: Record<WorldId, string> = {
  shell: 'nothing leaves the box',
  hand: 'nothing leaves the box',
  cloud: 'no --endpoint-url, so nothing leaves',
};

export function effectsText(record: WorldRecord, state: WalkState): string {
  const plan = state.plan.rev ? record.fixed : record.plan;
  return plan.effectsOutside.length === 0 ? NOTHING_LEAVES[record.id] : plan.effectsOutside.join(', ');
}

/**
 * @param runs the committed runs file
 * @param scheduler timer functions; defaults to the globals
 * @param inView whether the section has been in view (from `useInView`); the first 'seen' starts the Shell walk.
 *   'unsupported' shows the final state with no timer. Ignored under Reduced_Motion.
 */
export function useWalkthrough(
  runs: RunsFile,
  scheduler: Scheduler = defaultScheduler,
  inView: InViewState = 'pending',
): Walkthrough {
  const reduced = useReducedMotion();
  const ids = useRef<number[]>([]);
  const played = useRef(false);

  const [state, setState] = useState<WalkState>(() =>
    reduced || inView === 'unsupported'
      ? settle(runs.worlds.shell, LAST_STEP)
      : initialState(runs.worlds.shell),
  );

  const cancelAll = useCallback(() => {
    for (const id of ids.current) scheduler.clearTimeout(id);
    ids.current = [];
  }, [scheduler]);

  const schedule = useCallback(
    (record: WorldRecord, from: number, to: number) => {
      const base = STEP_START[from] ?? 0;
      for (let k = from; k <= to; k++) {
        const start = (STEP_START[k] ?? 0) - base;
        for (const { at, event } of buildScript(record, k)) {
          ids.current.push(
            scheduler.setTimeout(() => {
              setState((s) => reduceWalk(s, event as WalkEvent));
            }, start + at),
          );
        }
      }
    },
    [scheduler],
  );

  const start = useCallback(
    (world: WorldId) => {
      cancelAll();
      const record = runs.worlds[world];
      if (reduced) {
        setState(settle(record, LAST_STEP));
        return;
      }
      setState(initialState(record));
      schedule(record, 0, LAST_STEP);
    },
    [cancelAll, reduced, runs, schedule],
  );

  const world = state.world;

  const pickWorld = useCallback(
    (w: WorldId) => {
      played.current = true;
      start(w);
    },
    [start],
  );

  const replay = useCallback(() => {
    played.current = true;
    start(world);
  }, [start, world]);

  const jump = useCallback(
    (n: number) => {
      const step = Math.max(0, Math.min(LAST_STEP, Math.trunc(n)));
      played.current = true;
      cancelAll();
      const record = runs.worlds[world];
      if (reduced) {
        setState(settle(record, step));
        return;
      }
      setState(settle(record, step - 1));
      schedule(record, step, step);
    },
    [cancelAll, reduced, runs, schedule, world],
  );

  // First time in view: play the Shell walk. No signal, no autoplay.
  useEffect(() => {
    if (played.current) return;
    if (reduced) {
      played.current = true;
      return;
    }
    if (inView === 'unsupported') {
      played.current = true;
      setState(settle(runs.worlds.shell, LAST_STEP));
      return;
    }
    if (inView === 'seen') {
      played.current = true;
      start('shell');
    }
  }, [inView, reduced, runs, start]);

  // Reduced_Motion turning on mid-walk: cancel the timers and show the final state.
  useEffect(() => {
    if (!reduced) return;
    cancelAll();
    setState((s) => settle(runs.worlds[s.world], LAST_STEP));
  }, [reduced, cancelAll, runs]);

  // Unmount (or a new scheduler): no pending timer is left.
  useEffect(() => cancelAll, [cancelAll]);

  const record = runs.worlds[world];
  const view = useMemo<WalkView>(
    () => ({
      ...state,
      ward: { id: record.ward.id, kindLine: record.ward.line, effectsOutside: effectsText(record, state) },
    }),
    [state, record],
  );

  return { view, world, step: state.step, controls: { pickWorld, replay, jump } };
}
