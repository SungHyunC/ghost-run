/** Frame recorder: one pose frame every `frameStrideSteps` simulated steps (the controller records, this packs). */
import { WORLD_CONFIG } from './world-config.js';

export interface FrameTrace {
  readonly strideSteps: number;
  readonly bodyCount: number;
  /** Frames one after another, bodyCount * POSE_STRIDE floats each; for drawing only, never hashed. */
  readonly poses: Float32Array;
}

export const FRAME_STRIDE_STEPS: number = WORLD_CONFIG.frameStrideSteps;

export function concatFrames(parts: readonly Float32Array[]): Float32Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Float32Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function makeFrameTrace(poses: Float32Array, bodyCount: number): FrameTrace {
  return { strideSteps: FRAME_STRIDE_STEPS, bodyCount, poses };
}
