// The messages between the page and the Ghost Hand worker, and the constants both sides read.
// Types and constants only: this file must stay free of imports that pull in MuJoCo, so the page chunk can share it.

import type { LiveAnswer } from './types';

/** A run longer than this gives `failed: 'timeout'`. */
export const HAND_TIMEOUT_MS = 30_000;

/** Extra time the page waits for the worker's own timeout answer before it stops the worker. */
export const HAND_GUARD_MS = 2_000;

export interface HandRunRequest {
  type: 'run';
  id: number;
  speed: number;
  force: number;
  distance: number;
}

export interface HandDisposeRequest {
  type: 'dispose';
}

export type HandWorkerRequest = HandRunRequest | HandDisposeRequest;

/** The answer is plain data (structured-clone safe): no class instance, no function. */
export interface HandWorkerReply {
  type: 'answer';
  id: number;
  answer: LiveAnswer;
}
