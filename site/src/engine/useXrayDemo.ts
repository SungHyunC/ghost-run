import { useEffect, useRef } from 'react';
import { XRAY_OFF_MS, XRAY_ON_MS } from '../config';
import type { Scheduler } from './scheduler';

const INPUT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

export interface XrayDemoStart {
  /** True once the page that shows the switch was opened for the first time. */
  started: boolean;
  /** True while that page is the current page. */
  active: boolean;
}

/**
 * Plays the X-ray peek once per load: switch on after 1600 ms, off after 4400 ms,
 * starting when `started` turns true. Never runs under Reduced_Motion. Both timers
 * are cancelled on the first user input (the returned `cancel`, or any pointer, key,
 * or touch event), on unmount, and, with the switch set off, when `active` turns
 * false while the peek still runs.
 */
export function useXrayDemo(
  scheduler: Scheduler,
  reducedMotion: boolean,
  setChecked: (on: boolean) => void,
  { started, active }: XrayDemoStart,
): () => void {
  const ids = useRef<number[]>([]);
  const played = useRef(false);
  const peeking = useRef(false);
  const setRef = useRef(setChecked);
  setRef.current = setChecked;

  const cancelRef = useRef(() => {
    for (const id of ids.current) scheduler.clearTimeout(id);
    ids.current = [];
    peeking.current = false;
  });

  useEffect(() => {
    if (!started || reducedMotion || played.current) return;
    played.current = true;
    peeking.current = true;
    const cancel = () => {
      for (const id of ids.current) scheduler.clearTimeout(id);
      ids.current = [];
      peeking.current = false;
      for (const ev of INPUT_EVENTS) window.removeEventListener(ev, cancel);
    };
    cancelRef.current = cancel;
    ids.current = [
      scheduler.setTimeout(() => {
        setRef.current(true);
      }, XRAY_ON_MS),
      scheduler.setTimeout(() => {
        setRef.current(false);
        cancel();
      }, XRAY_OFF_MS),
    ];
    for (const ev of INPUT_EVENTS) window.addEventListener(ev, cancel);
    return () => {
      // An interrupted peek (unmount, scheduler change) may start again; a finished or
      // input-ended one stays ended.
      const interrupted = peeking.current;
      cancel();
      if (interrupted) played.current = false;
    };
  }, [started, scheduler, reducedMotion]);

  useEffect(() => {
    if (active || !peeking.current) return;
    cancelRef.current();
    setRef.current(false);
  }, [active]);

  return () => {
    cancelRef.current();
  };
}
