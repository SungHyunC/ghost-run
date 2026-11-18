// Wards file resolution and loading for the hook (Requirement 3 and 4).
// One resolver, shared with the MCP server. No LLM calls.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { formatConfigError } from '@ghost-run/wards-config';
import { loadWardsFile } from '@ghost-run/wards-config/node';

/** Most error strings returned to the caller. */
export const MAX_ERRORS = 5;

/**
 * Wards file path: GHOST_RUN_WARDS_FILE when set (non-empty), else <root>/wards.yaml,
 * else <root>/apps/ghost-shell/wards.yaml. When neither default exists the first is
 * returned, so the loader reports a missing file.
 * @param {string} root
 * @param {Record<string, string | undefined>} env
 * @param {(path: string) => boolean} [exists]
 * @returns {string}
 */
export function resolveWardsFile(root, env, exists = existsSync) {
  const fromEnv = env.GHOST_RUN_WARDS_FILE;
  if (typeof fromEnv === 'string' && fromEnv !== '') return fromEnv;
  const primary = join(root, 'wards.yaml');
  if (exists(primary)) return primary;
  const fallback = join(root, 'apps', 'ghost-shell', 'wards.yaml');
  return exists(fallback) ? fallback : primary;
}

/**
 * @typedef {{ ok: true, wardSet: import('@ghost-run/core').WardSet, safeCommands: string[], file: string }
 *   | { ok: false, errors: string[] }} WardsLoad
 */

/**
 * Loads the wards file. Returns the whole WardSet or `ok: false` with at most 5 strings.
 * @param {string} root
 * @param {Record<string, string | undefined>} env
 * @param {(path: string) => Promise<any>} [loader]
 * @returns {Promise<WardsLoad>}
 */
export async function loadWardsForHook(root, env, loader = loadWardsFile) {
  const file = resolveWardsFile(root, env);
  /** @type {any} */
  let result;
  try {
    result = await loader(file);
  } catch {
    return { ok: false, errors: ['wards file could not be loaded'] };
  }
  if (!result || result.ok !== true || !result.wardSet) {
    const list = result && Array.isArray(result.errors) ? result.errors : [];
    const errors = list.slice(0, MAX_ERRORS).map((/** @type {any} */ e) => formatConfigError(e));
    return { ok: false, errors: errors.length > 0 ? errors : ['wards file is not valid'] };
  }
  const safeCommands = Array.isArray(result.safeCommands) ? [...result.safeCommands] : [];
  return { ok: true, wardSet: result.wardSet, safeCommands, file };
}
