// The page side of the Ghost Hand live engine: a LiveEngine that forwards each run to the Hand worker.
// The worker is started with the engine (the page creates the engine when Ghost Hand is first picked).
// A worker error or a run that outlives the guard stops the worker; the next run starts a fresh one.
// No MuJoCo import here, so this stays in a small chunk.

import type { Scheduler } from '../engine/scheduler';
import { defaultScheduler } from '../engine/scheduler';
import { HAND_GUARD_MS, HAND_TIMEOUT_MS } from './hand-protocol';
import type { HandRunRequest, HandWorkerReply, HandWorkerRequest } from './hand-protocol';
import type { LiveAnswer, LiveEngine, LiveInput } from './types';

/** The part of a Web Worker that the proxy uses. */
export interface HandWorkerLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: HandWorkerRequest): void;
  terminate(): void;
}

export interface HandProxyServices {
  /** Starts one Hand worker. May throw; the engine then fails to load. */
  spawn(): HandWorkerLike;
  scheduler?: Scheduler;
}

function messageOf(event: unknown): string {
  if (event instanceof Error) return event.message;
  if (typeof event === 'object' && event !== null && 'message' in event) return String((event as { message: unknown }).message);
  return 'unknown error';
}

export function createHandProxy(services: HandProxyServices): LiveEngine {
  const scheduler = services.scheduler ?? defaultScheduler;
  let worker: HandWorkerLike | null = services.spawn();
  let answered = false;
  let nextId = 1;
  let chain: Promise<unknown> = Promise.resolve();
  let disposed = false;
  let settlePending: ((answer: LiveAnswer) => void) | null = null;

  function stop(): void {
    const w = worker;
    worker = null;
    if (w === null) return;
    w.onmessage = null;
    w.onerror = null;
    w.onmessageerror = null;
    w.terminate();
  }

  function runOnce(input: LiveInput): Promise<LiveAnswer> {
    if (input.world !== 'hand') return Promise.resolve({ status: 'failed', cause: 'internal' });
    if (disposed) return Promise.resolve({ status: 'failed', cause: 'run', detail: 'engine disposed' });
    let w = worker;
    if (w === null) {
      try {
        w = services.spawn();
      } catch (error) {
        return Promise.resolve({ status: 'failed', cause: 'load', detail: messageOf(error) });
      }
      worker = w;
    }
    const target = w;
    const id = nextId++;
    return new Promise<LiveAnswer>((resolve) => {
      let timer: number | undefined;
      const settle = (answer: LiveAnswer, stopWorker: boolean): void => {
        if (settlePending === null) return;
        settlePending = null;
        if (timer !== undefined) scheduler.clearTimeout(timer);
        if (stopWorker) stop();
        resolve(answer);
      };
      settlePending = (answer) => {
        settle(answer, true);
      };
      target.onmessage = (event) => {
        const data = event.data as HandWorkerReply;
        if (data.type !== 'answer' || data.id !== id) return;
        answered = true;
        settle(data.answer, false);
      };
      target.onerror = (event) => {
        settle({ status: 'failed', cause: answered ? 'run' : 'load', detail: `worker error: ${messageOf(event)}` }, true);
      };
      target.onmessageerror = () => {
        settle({ status: 'failed', cause: 'run', detail: 'worker messageerror' }, true);
      };
      timer = scheduler.setTimeout(() => {
        settle({ status: 'failed', cause: 'timeout', detail: 'the Hand worker did not answer in time' }, true);
      }, HAND_TIMEOUT_MS + HAND_GUARD_MS);
      const request: HandRunRequest = { type: 'run', id, speed: input.speed, force: input.force, distance: input.distance };
      try {
        target.postMessage(request);
      } catch (error) {
        settle({ status: 'failed', cause: 'run', detail: messageOf(error) }, true);
      }
    });
  }

  return {
    world: 'hand',
    async warm() {
      // The worker starts with the engine; MuJoCo loads on the first run.
    },
    run(input) {
      const next = chain.then(() => runOnce(input));
      chain = next.catch(() => undefined);
      return next;
    },
    dispose() {
      disposed = true;
      const pending = settlePending;
      const w = worker;
      if (w !== null) {
        try {
          w.postMessage({ type: 'dispose' });
        } catch {
          // The worker is stopped next.
        }
      }
      stop();
      pending?.({ status: 'failed', cause: 'run', detail: 'engine disposed' });
    },
  };
}
