import type { Change, Effect, GhostReport, Snapshot, World } from './types.js';

/**
 * In-process reference ghost runner.
 *
 * Applies `actions` in order to successive snapshots via `world.step`.
 * `report.snapshots` holds `start` followed by one snapshot per action, so its
 * last element is the final state. `report.changes[i]` and
 * `report.effectsOutside[i]` belong to `actions[i]`.
 *
 * A failed step (`result.success === false`) is recorded and the run continues
 * from that snapshot; this function does not throw for step failures.
 * `observedEvents` and `variantResults` start empty; the Box layer fills them.
 */
export async function ghostRun<S, A>(
  world: World<S, A>,
  start: Snapshot<S>,
  actions: readonly A[],
): Promise<GhostReport<S>> {
  const snapshots: Snapshot<S>[] = [start];
  const changes: Change[][] = [];
  const effectsOutside: Effect[][] = [];

  let current = start;
  for (const action of actions) {
    effectsOutside.push(world.effectsOutside(action));
    const next = await world.step(current, action);
    changes.push(world.diff(current, next));
    snapshots.push(next);
    current = next;
  }

  return {
    snapshots,
    changes,
    effectsOutside,
    observedEvents: [],
    variantResults: [],
  };
}
