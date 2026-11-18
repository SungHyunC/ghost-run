// Determinism_Self_Check (design.md "Self-check"; requirements 10.7, 10.9, 3.11).
// Runs REFERENCE_PLAN twice on two fresh Base_World instances, compares both Trajectory_Hashes with
// each other and with the Golden_Hash, then runs the restore check.
import { REFERENCE_PLAN, bitEqual } from '@ghost-run/drawer-arm';
import type { GhostHandAction, GhostHandState, GhostHandWorld } from '@ghost-run/drawer-arm';
import { DETERMINISM_FAILED_TEXT, determinismReproducedText } from './texts';

export type SelfCheckFailureReason =
  | 'not-reproduced'
  | 'restore-mismatch'
  | 'engine-error'
  | 'no-secure-context';

export type SelfCheckResult =
  | { readonly state: 'pending' }
  | { readonly state: 'ok'; readonly hash: string; readonly restoreOk: true }
  | { readonly state: 'failed'; readonly reason: SelfCheckFailureReason; readonly hash?: string };

/** Number of leading plan actions run before the snapshot of the restore check. */
const RESTORE_PREFIX_LENGTH = 2;

async function referenceHash(createWorld: () => Promise<GhostHandWorld>): Promise<string> {
  const world = await createWorld();
  try {
    const result = await world.referenceExecute(REFERENCE_PLAN);
    return result.trajectoryHash;
  } finally {
    world.dispose();
  }
}

async function runFrom(
  world: GhostHandWorld,
  start: Awaited<ReturnType<GhostHandWorld['snapshot']>>,
  actions: readonly GhostHandAction[],
): Promise<GhostHandState> {
  let current = start;
  for (const action of actions) {
    current = await world.step(current, action);
    if (!current.result.success) throw new Error('step failed in the restore check');
  }
  return current.state;
}

/** Run a prefix to a snapshot, run the remainder twice from it, and compare the two final states. */
async function restoreCheck(createWorld: () => Promise<GhostHandWorld>): Promise<boolean> {
  const world = await createWorld();
  try {
    const start = await world.snapshot();
    const prefix = REFERENCE_PLAN.slice(0, RESTORE_PREFIX_LENGTH);
    const rest = REFERENCE_PLAN.slice(RESTORE_PREFIX_LENGTH);
    let mid = start;
    for (const action of prefix) {
      mid = await world.step(mid, action);
      if (!mid.result.success) throw new Error('step failed in the restore check');
    }
    const first = await runFrom(world, mid, rest);
    const second = await runFrom(world, mid, rest);
    return bitEqual(first, second);
  } finally {
    world.dispose();
  }
}

/**
 * `golden` undefined: only the two runs are compared with each other (the Golden_Hash is not recorded yet).
 * Missing `crypto.subtle` gives `no-secure-context` (requirement 3.11).
 */
export async function runSelfCheck(
  createWorld: () => Promise<GhostHandWorld>,
  golden: string | undefined,
): Promise<SelfCheckResult> {
  if (globalThis.crypto?.subtle === undefined) return { state: 'failed', reason: 'no-secure-context' };
  let first: string;
  try {
    first = await referenceHash(createWorld);
    const second = await referenceHash(createWorld);
    if (first !== second) return { state: 'failed', reason: 'not-reproduced', hash: first };
    if (golden !== undefined && first !== golden) return { state: 'failed', reason: 'not-reproduced', hash: first };
  } catch {
    return { state: 'failed', reason: 'engine-error' };
  }
  try {
    if (!(await restoreCheck(createWorld))) return { state: 'failed', reason: 'restore-mismatch', hash: first };
  } catch {
    return { state: 'failed', reason: 'engine-error' };
  }
  return { state: 'ok', hash: first, restoreOk: true };
}

/** Display line for a finished self-check (first 12 hex digits for the reproduced case); null while pending. */
export function selfCheckText(result: SelfCheckResult): string | null {
  if (result.state === 'pending') return null;
  if (result.state === 'ok') return determinismReproducedText(result.hash);
  return DETERMINISM_FAILED_TEXT;
}
