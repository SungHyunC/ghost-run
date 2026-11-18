// Overlay view model (Requirement 13.3). Pure function of the run data; it computes no verdict.
import type { OverlayInput } from '../pipeline/types';

export type FailureReason = 'unsuccessful' | 'forbidden-contact' | 'joint-limit' | 'self-collision';

export interface OverlayArm {
  /** 'base' for the base arm, otherwise the variant id. */
  readonly id: string;
  readonly kind: 'base' | 'ghost';
  readonly frames: Float32Array;
  readonly failed: boolean;
  /** Conditions that hold, in a fixed order; empty unless failed. */
  readonly reasons: readonly FailureReason[];
  /** Text label that pairs the color with a word (Requirement 13.8). */
  readonly label: string;
  /** Icon glyph that pairs the color with a symbol; decorative (aria-hidden by the renderer). */
  readonly icon: string;
}

export interface OverlayViewModel {
  /** The base arm first, then one ghost arm per variant in index order. */
  readonly arms: readonly OverlayArm[];
  readonly bodyCount: number;
  readonly framesPerSecond: number;
}

const REASON_TEXT: Record<FailureReason, string> = {
  unsuccessful: 'plan not successful',
  'forbidden-contact': 'forbidden contact',
  'joint-limit': 'joint limit exceeded',
  'self-collision': 'self collision',
};

export function buildOverlayViewModel(input: OverlayInput): OverlayViewModel {
  const arms: OverlayArm[] = [
    { id: 'base', kind: 'base', frames: input.base.frames, failed: false, reasons: [], label: 'base', icon: '\u25CB' },
  ];
  for (const v of input.variants) {
    const r = v.result;
    const reasons: FailureReason[] = [];
    if (!r.success) reasons.push('unsuccessful');
    if (r.forbiddenContactOccurred === true) reasons.push('forbidden-contact');
    if (r.jointLimitExceeded === true) reasons.push('joint-limit');
    if (r.selfCollisionOccurred === true) reasons.push('self-collision');
    const failed = reasons.length > 0;
    arms.push({
      id: v.id,
      kind: 'ghost',
      frames: v.frames,
      failed,
      reasons,
      label: failed ? `${v.id}: failed (${reasons.map((x) => REASON_TEXT[x]).join(', ')})` : `${v.id}: passed`,
      icon: failed ? '\u2715' : '\u2713',
    });
  }
  return { arms, bodyCount: input.bodyCount, framesPerSecond: input.framesPerSecond };
}
