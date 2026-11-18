import { compareCodePoints, type Scene } from '@ghost-run/core';
import type { PlaygroundState } from '../state.js';

/** File tree and database table lists. No bytes, no content. */
export function renderScene(state: PlaygroundState, projectName: string): Scene {
  const paths = Object.keys(state.entries).sort(compareCodePoints);
  const files = [];
  const databases = [];
  for (const path of paths) {
    const entry = state.entries[path];
    if (entry === undefined) continue;
    if (entry.kind === 'dir') {
      files.push({ path, type: 'directory', size: 0 });
      continue;
    }
    files.push({ path, type: 'file', size: entry.bytes.byteLength });
    if (entry.tables !== undefined) {
      const tables = Object.keys(entry.tables)
        .sort(compareCodePoints)
        .map((name) => ({ name, rows: entry.tables?.[name] ?? 0 }));
      databases.push({ path, tables });
    }
  }
  return { project: projectName, files, databases };
}
