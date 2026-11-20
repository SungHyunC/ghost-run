import { useEffect, useRef } from 'react';
import { XRAY_OFF_MS, XRAY_ON_MS } from '../config';
import type { Scheduler } from './scheduler';

const INPUT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

/**
 * Plays the X-ray demo once: switch on after 1600 ms, off after 4400 ms.
 * Never runs under Reduced_Motion. Both timers are cancelled on the first user
 * input (the returned `cancel`, or any pointer, key, or touch event) and on unmount.
 */
export function useXrayDemo(
  scheduler: Scheduler,
  reducedMotion: boolean,
  setChecked: (on: boolean) => void,
): () => void {
  const ids = useRef<number[]>([]);
  const setRef = useRef(setChecked);
  setRef.current = setChecked;

  const cancelRef = useRef(() => {
    for (const id of ids.current) scheduler.clearTimeout(id);
    ids.current = [];
  });

  useEffect(() => {
    const cancel = () => {
      for (const id of ids.current) scheduler.clearTimeout(id);
      ids.current = [];
      for (const ev of INPUT_EVENTS) window.removeEventListener(ev, cancel);
    };
    cancelRef.current = cancel;
    if (reducedMotion) return;
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
    return cancel;
  }, [scheduler, reducedMotion]);

  return () => {
    cancelRef.current();
  };
}
