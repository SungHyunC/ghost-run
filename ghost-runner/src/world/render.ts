import type { Scene, SceneValue, Snapshot } from '@ghost-run/core';
import { compareBytes } from '../fs/manifest.js';
import type { RepoState } from './types.js';

/**
 * Scene of a Repo_World snapshot: `{ kind: "repo-tree", entries: [{ path, type, size }] }`,
 * sorted by path in byte order (Req 2.6). Pure; every value is a string or a finite number,
 * so `JSON.parse(JSON.stringify(scene))` equals the scene.
 */
export function renderRepoTree(s: Snapshot<RepoState>): Scene {
  const entries: SceneValue[] = [...s.state.entries]
    .sort((a, b) => compareBytes(a.path, b.path))
    .map((e) => ({ path: e.path, type: e.type, size: e.size }));
  return { kind: 'repo-tree', entries };
}
