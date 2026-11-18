// Self-protection floor (task 5.5). Pure: no I/O, no file reads.
// A write to the gate's own files is never allowed without a human.

import { compilePathSet } from '@ghost-run/core';

/** Fixed notice for a change under a Self_Protected_Path (Requirement 6.6, 10). */
export const SELF_PROTECT_NOTICE = 'step 0: change to a gate-protected path needs human approval.';

/** Fixed Self_Protected_Path patterns (workspace-relative). */
export const SELF_PROTECTED = Object.freeze([
  '.kiro/hooks/**',
  'integrations/kiro-hook/**',
  'integrations/mcp/**',
  '.ghost-run/**',
]);

const FILE_KINDS = new Set(['file-created', 'file-overwritten', 'file-deleted', 'symlink-changed']);

/**
 * @typedef {{ kind: string, path?: unknown, [key: string]: unknown }} AnyChange
 * @typedef {{
 *   isSelfProtected(path: string): boolean,
 *   selfProtectedChanges<T extends AnyChange>(changes: readonly T[]): T[],
 * }} SelfProtect
 */

/**
 * Build the matcher. The resolved Wards_File (workspace-relative) is added when given.
 * A Wards_File outside the workspace is not listed here; it is protected only
 * through the tools the gate judges.
 * @param {string | null | undefined} [wardsFileRelative]
 * @returns {SelfProtect}
 */
export function createSelfProtect(wardsFileRelative) {
  const patterns = [...SELF_PROTECTED];
  if (typeof wardsFileRelative === 'string' && wardsFileRelative.length > 0) {
    patterns.push(wardsFileRelative);
  }
  const set = compilePathSet(patterns, { caseSensitive: false });
  /** @param {string} path */
  const isSelfProtected = (path) => typeof path === 'string' && set.test(path).matched;
  return {
    isSelfProtected,
    selfProtectedChanges: (changes) =>
      changes.filter(
        (c) => FILE_KINDS.has(c.kind) && typeof c.path === 'string' && isSelfProtected(c.path),
      ),
  };
}

const defaultProtect = createSelfProtect(null);

/** @param {string} path */
export function isSelfProtected(path) {
  return defaultProtect.isSelfProtected(path);
}

/**
 * @template {AnyChange} T
 * @param {readonly T[]} changes
 * @returns {T[]}
 */
export function selfProtectedChanges(changes) {
  return defaultProtect.selfProtectedChanges(changes);
}
