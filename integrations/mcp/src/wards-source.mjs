// Which wards the MCP tools use: the workspace Wards_File, or the built-in default when there is none.
// The Ghost_Gate does not use this module; it keeps failing closed for a missing file.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseWards, formatConfigError } from '@ghost-run/wards-config';
import { loadWardsForHook } from '@ghost-run/kiro-hook';
import { DEFAULT_WARDS_YAML } from './default-wards.mjs';

export const DEFAULT_WARDS_NOTICE =
  'No wards file in this project; using the built-in default wards (protect-data, no-data-loss, no-secret-egress). Add wards.yaml to change them.';

/**
 * True when none of the Wards_File locations of Requirement 3, criterion 7 exists: no explicit
 * GHOST_RUN_WARDS_FILE, no <root>/wards.yaml, no <root>/apps/ghost-shell/wards.yaml.
 * @param {string} root
 * @param {Record<string, string | undefined>} env
 * @param {(p: string) => boolean} [exists]
 */
export function hasNoWardsFile(root, env, exists = existsSync) {
  const fromEnv = env['GHOST_RUN_WARDS_FILE'];
  if (typeof fromEnv === 'string' && fromEnv !== '') return false;
  return !exists(join(root, 'wards.yaml')) && !exists(join(root, 'apps', 'ghost-shell', 'wards.yaml'));
}

/**
 * Parse result of the built-in default wards.
 * @returns {import('@ghost-run/wards-config').ParseResult}
 */
export function parseDefaultWards() {
  return parseWards(DEFAULT_WARDS_YAML);
}

/**
 * Load the wards for a tool call.
 * @param {string} root
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<{ ok: true, wardSet: any, safeCommands: string[], builtin: boolean } | { ok: false, errors: string[] }>}
 */
export async function loadWardsOrDefault(root, env) {
  if (hasNoWardsFile(root, env)) {
    const parsed = parseDefaultWards();
    if (!parsed.ok) return { ok: false, errors: parsed.errors.slice(0, 5).map((e) => formatConfigError(e)) };
    return { ok: true, wardSet: parsed.wardSet, safeCommands: [...parsed.safeCommands], builtin: true };
  }
  const load = await loadWardsForHook(root, env);
  return load.ok ? { ok: true, wardSet: load.wardSet, safeCommands: load.safeCommands, builtin: false } : load;
}
