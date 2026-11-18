import { SCENE_DEPTH, SCENE_ENTRIES } from './limits';
import { flattenGeneric, redactGenericValue } from './redact';
import type { GenericRow } from './redact';

/** Flattened, read-only view of a Scene value. All rows are kept; the view renders the first `shown`. */
export interface SceneTree {
  readonly rows: readonly GenericRow[];
  /** Total number of rows. */
  readonly total: number;
  /** Rows rendered before the reveal control: min(total, SCENE_ENTRIES). */
  readonly shown: number;
}

/**
 * Builds the SceneTree of a scene value (design: "Secret-like keys", Mirror world).
 * Returns null when the scene is absent. Total: never throws, never mutates the input.
 */
export function buildSceneTree(scene: unknown): SceneTree | null {
  if (scene === undefined) return null;
  const rows = flattenGeneric(redactGenericValue(scene, null, { maxDepth: SCENE_DEPTH }));
  return { rows, total: rows.length, shown: Math.min(rows.length, SCENE_ENTRIES) };
}
