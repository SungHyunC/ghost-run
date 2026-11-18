// Pure helpers of the reference execution (requirements 10.6, 12.8, 12.9). No engine import at runtime
// beyond constants; the world call itself lives in the shell.
import { STATIC_LAYOUT, WORLD_CONFIG } from '@ghost-run/drawer-arm';
import type { GhostHandState, ReferenceResult } from '@ghost-run/drawer-arm';
import type { OverlayInput } from './pipeline/types';
import type { SelfCheckResult } from './self-check';
import { P2_CHECK_SCOPE_TEXT, P2_MATCH_TEXT, P2_MISMATCH_TEXT, P2_SCOPE_TEXT } from './texts';

const FRAMES_PER_SECOND = 1 / (WORLD_CONFIG.timeStepS * WORLD_CONFIG.frameStrideSteps);

/** Final drawer displacement (meters) of a state. */
export function drawerDisplacementOf(state: GhostHandState): number {
  return state.integration[STATIC_LAYOUT.qpos.offset + STATIC_LAYOUT.drawerQposIndex] ?? 0;
}

/** Deep structural equality; numbers compare with `Object.is`, so `-0` and `0` differ. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b)) return false;
    if (a.constructor !== b.constructor || a.byteLength !== b.byteLength) return false;
    const x = a as unknown as ArrayLike<unknown>;
    const y = b as unknown as ArrayLike<unknown>;
    for (let i = 0; i < x.length; i += 1) if (!Object.is(x[i], y[i])) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** Req 10.6: the `Change[]` of the base ghost run against the `Change[]` of the reference execution. */
export function diffsMatch(baseChanges: readonly unknown[], referenceChanges: readonly unknown[]): boolean {
  return deepEqual(baseChanges, referenceChanges);
}

/**
 * The P2 check lines, or null. Rendered only while `enabled` (P2_TEXT_ENABLED) is true and the
 * Determinism_Self_Check passed (requirement 10.9). `match` null means no comparison was made.
 */
export function p2CheckLines(
  enabled: boolean,
  selfCheck: SelfCheckResult,
  match: boolean | null,
): readonly string[] | null {
  if (!enabled || selfCheck.state !== 'ok' || match === null) return null;
  return [match ? P2_MATCH_TEXT : P2_MISMATCH_TEXT, P2_CHECK_SCOPE_TEXT, P2_SCOPE_TEXT];
}

/** Overlay input that animates the reference execution (one arm, no variants), or null without frames. */
export function referenceOverlayInput(result: ReferenceResult): OverlayInput | null {
  if (result.frames === undefined) return null;
  return {
    variants: [],
    base: { frames: result.frames.poses },
    bodyCount: result.frames.bodyCount,
    framesPerSecond: FRAMES_PER_SECOND,
  };
}
