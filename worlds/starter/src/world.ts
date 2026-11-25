import { compareCodePoints } from '@ghost-run/core';
import type { Change, Effect, FingerprintResult, Scene, Snapshot, World } from '@ghost-run/core';

export interface Todo { readonly id: number; readonly text: string }
export interface TodoState { readonly todos: readonly Todo[] }
export type Action =
  | { readonly kind: 'add'; readonly text: string }
  | { readonly kind: 'remove'; readonly id: number }
  | { readonly kind: 'clear' };

/** The fixed fixture: reality starts with these three to-dos. */
export const FIXTURE: TodoState = {
  todos: [{ id: 1, text: 'water the plants' }, { id: 2, text: 'write the report' }, { id: 3, text: 'call the dentist' }],
};

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

export function createStarterWorld(reality: TodoState = FIXTURE): World<TodoState, Action> {
  let counter = 0;
  const snap = (state: TodoState, error?: string): Snapshot<TodoState> => ({
    id: `starter-${++counter}`, state, result: error === undefined ? { success: true } : { success: false, error },
  });

  return {
    // Copy reality; the caller can change the copy but never reality.
    async snapshot() { return snap(structuredClone(reality)); },

    // Apply one action to a new snapshot. Pure: no throw, no mutation. A bad action gives success: false.
    async step(s, a) {
      const todos = s.state.todos;
      if (a?.kind === 'add' && typeof a.text === 'string' && a.text.trim() !== '') {
        const id = todos.reduce((max, t) => Math.max(max, t.id), 0) + 1;
        return snap({ todos: [...todos, { id, text: a.text }] });
      }
      if (a?.kind === 'remove' && todos.some((t) => t.id === a.id)) return snap({ todos: todos.filter((t) => t.id !== a.id) });
      if (a?.kind === 'clear') return snap({ todos: [] });
      return snap({ todos: [...todos] }, `invalid action: ${JSON.stringify(a) ?? 'undefined'}`);
    },

    // List what changed as file-style changes on todos/<id>, sorted by path.
    diff(before, after): Change[] {
      const was = new Map(before.state.todos.map((t) => [`todos/${t.id}`, t.text]));
      const now = new Map(after.state.todos.map((t) => [`todos/${t.id}`, t.text]));
      const changes: Change[] = [];
      for (const [path, text] of now) {
        if (!was.has(path)) changes.push({ kind: 'file-created', path });
        else if (was.get(path) !== text) changes.push({ kind: 'file-overwritten', path });
      }
      for (const path of was.keys()) if (!now.has(path)) changes.push({ kind: 'file-deleted', path });
      return changes.sort((x, y) => compareCodePoints(String(x['path']), String(y['path'])));
    },

    // Describe a snapshot as plain data for a UI to draw.
    render(s): Scene { return { world: 'starter', todos: s.state.todos.map((t) => ({ id: t.id, text: t.text })) }; },

    // SHA-256 over a canonical encoding: one hashed entry per to-do, sorted by path.
    async fingerprint(): Promise<FingerprintResult> {
      const manifest: Record<string, string> = {};
      for (const t of reality.todos) manifest[`todos/${t.id}`] = await sha256(t.text);
      const rows = Object.entries(manifest).sort(([x], [y]) => compareCodePoints(x, y));
      return { hash: await sha256(JSON.stringify(rows)), manifest };
    },

    // A to-do list never reaches outside the copy.
    effectsOutside(): Effect[] { return []; },
  };
}
