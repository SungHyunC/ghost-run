// Test helpers: temporary Ghost_Store, canary arbitrary, Hook_Event builders, in-memory FsView.
import fc from 'fast-check';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Create a Ghost_Store folder in the OS temporary folder (outside the repository).
 * @returns {{ dir: string, storeDir: string, cleanup: () => void }}
 */
export function makeTempStore() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ghost-run-test-')));
  return {
    dir,
    storeDir: join(dir, '.ghost-run'),
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const CANARY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'.split('');

/** Canary secret: `sk-CANARY-` plus 1 to 24 characters from [A-Za-z0-9_-]. */
export const canaryArb = fc
  .array(fc.constantFrom(...CANARY_CHARS), { minLength: 1, maxLength: 24 })
  .map((chars) => `sk-CANARY-${chars.join('')}`);

/**
 * Build a Pre Tool Use Hook_Event.
 * @param {string} toolName
 * @param {Record<string, unknown>} toolInput
 * @param {{ cwd?: string, session_id?: string, hook_event_name?: string }} [over]
 */
export function makeHookEvent(toolName, toolInput, over = {}) {
  return {
    hook_event_name: over.hook_event_name ?? 'PreToolUse',
    cwd: over.cwd ?? '/work/repo',
    session_id: over.session_id ?? 'session-test-1',
    tool_name: toolName,
    tool_input: toolInput,
  };
}

/** @param {string} command @param {{ cwd?: string, session_id?: string }} [over] */
export const shellEvent = (command, over) => makeHookEvent('execute_bash', { command }, over);

/** @param {string} path @param {string} text @param {{ cwd?: string, session_id?: string }} [over] */
export const writeEvent = (path, text, over) =>
  makeHookEvent('fs_write', { path, text }, over);

/** @param {string} path @param {string} text @param {{ cwd?: string, session_id?: string }} [over] */
export const appendEvent = (path, text, over) =>
  makeHookEvent('fs_append', { path, text }, over);

/** @param {string} path @param {string} oldStr @param {string} newStr @param {{ cwd?: string, session_id?: string }} [over] */
export const replaceEvent = (path, oldStr, newStr, over) =>
  makeHookEvent('str_replace', { path, oldStr, newStr }, over);

/** @param {string} targetFile @param {{ cwd?: string, session_id?: string }} [over] */
export const deleteEvent = (targetFile, over) =>
  makeHookEvent('delete_file', { targetFile }, over);

/**
 * In-memory FsView with symbolic links modeled.
 * Entries: path -> { type: 'file' | 'dir' } or { type: 'symlink', target: string }.
 * @typedef {{ type: 'file' | 'dir' } | { type: 'symlink', target: string }} MemEntry
 * @param {Record<string, MemEntry>} [entries]
 */
export function makeMemFsView(entries = {}) {
  /** @param {string} p */
  const resolveLinks = (p) => {
    let cur = p;
    for (let i = 0; i < 40; i++) {
      const e = entries[cur];
      if (!e) return cur in entries ? cur : null;
      if (e.type !== 'symlink') return cur;
      cur = e.target;
    }
    return null;
  };
  return {
    /** @param {string} p */
    async lstat(p) {
      const e = entries[p];
      if (!e) return null;
      return /** @type {import('node:fs').Stats} */ (
        /** @type {unknown} */ ({
          isFile: () => e.type === 'file',
          isDirectory: () => e.type === 'dir',
          isSymbolicLink: () => e.type === 'symlink',
        })
      );
    },
    /** @param {string} p */
    async realpath(p) {
      return resolveLinks(p);
    },
    /** @param {string} p */
    async readdir(p) {
      const prefix = p.endsWith('/') ? p : `${p}/`;
      const names = new Set();
      for (const k of Object.keys(entries)) {
        if (k.startsWith(prefix) && k.length > prefix.length) {
          names.add(k.slice(prefix.length).split('/')[0]);
        }
      }
      return [...names].sort();
    },
  };
}
