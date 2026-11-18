// Suite selection for contract-pbt (pure; no I/O). Requirement 15.1 and 15.3.

/** Valid world folder name (same rule as world-scaffold). */
export const WORLD_NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;

/** @typedef {{ kind: 'core' } | { kind: 'world', world: string } | { kind: 'none' }} SuiteSelection */

/**
 * Map a workspace-relative path (`/` separators) to the suites to run.
 * `core/<...>` gives core; `worlds/<valid-name>/<...>` gives world. Everything
 * else gives none: absolute paths, backslashes, `..` or `.` or empty segments,
 * NUL, look-alike prefixes (`corex/`, `worlds-old/`), and the bare folders.
 * @param {unknown} relPath
 * @returns {SuiteSelection}
 */
export function selectSuites(relPath) {
  if (typeof relPath !== 'string' || relPath === '' || relPath.includes('\0') || relPath.includes('\\')) {
    return { kind: 'none' };
  }
  const parts = relPath.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return { kind: 'none' };
  if (parts[0] === 'core' && parts.length >= 2) return { kind: 'core' };
  if (parts[0] === 'worlds' && parts.length >= 3) {
    const name = /** @type {string} */ (parts[1]);
    if (WORLD_NAME_RE.test(name)) return { kind: 'world', world: name };
  }
  return { kind: 'none' };
}
