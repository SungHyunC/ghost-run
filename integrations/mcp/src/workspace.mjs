// Workspace root resolution for the MCP server (kiro-integration Requirement 18, criterion 6).
// A power's server starts in the power's install folder, so the working directory alone is not the user's
// project. Order: MCP roots, GHOST_RUN_WORKSPACE, the working directory, then the `workspace` tool input
// (only when the first three give no root). PWD is not a source: Kiro IDE sets it to the folder Kiro was
// launched from, not to the window's project. A folder that is the server's own folder is never a root.
// Every source is injected, so a test needs no host.
import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKSPACE_ENV = 'GHOST_RUN_WORKSPACE';
export const ROOT_UNKNOWN_MESSAGE =
  'Pass `workspace` (the absolute path of your project root) and call again. Workspace root unknown: the server has no project root of its own (set GHOST_RUN_WORKSPACE to give it one)';
export const WORKSPACE_MISMATCH_MESSAGE = "workspace does not match this server's workspace root";
export const WORKSPACE_REFUSALS = {
  notAbsolute: 'workspace must be an absolute path',
  notFolder: 'workspace is not an existing folder',
  isRoot: 'workspace must not be the file system root /',
  isHome: 'workspace must not be the home folder itself',
  isOwn: "workspace must not be the server's own folder",
};

/**
 * The folder that holds the running bundle's `server/` folder (the power folder), or the `integrations/mcp`
 * package folder when running from source (`src/`). Any other location is its own folder.
 * @param {string} moduleUrl `import.meta.url` of the server module
 * @returns {string}
 */
export function ownFolderOf(moduleUrl) {
  const dir = path.dirname(fileURLToPath(moduleUrl));
  return ['server', 'src'].includes(path.basename(dir)) ? path.dirname(dir) : dir;
}

/** @param {string} p */
function isFolder(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} p */
function real(p) {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * @typedef {{
 *   env: Record<string, string | undefined>,
 *   cwd: () => string,
 *   ownDir: string,
 *   home?: () => string,
 *   getRoots?: () => Promise<string[] | null>,
 *   isFolder?: (p: string) => boolean,
 *   real?: (p: string) => string,
 * }} WorkspaceSources
 * @typedef {{ ok: true, root: string, source: 'roots' | 'env' | 'cwd' | 'workspace' } | { ok: false, error: string }} RootResult
 */

/**
 * @param {WorkspaceSources} sources
 */
export function createWorkspaceResolver(sources) {
  const folder = sources.isFolder ?? isFolder;
  const realOf = sources.real ?? real;
  const own = realOf(sources.ownDir);
  /** @param {string} p */
  const usable = (p) => path.isAbsolute(p) && folder(p);
  /** @param {string} p */
  const notOwn = (p) => realOf(p) !== own;
  /** @type {string | null | undefined} undefined: not asked yet */
  let cachedRoot;

  /**
   * Check the `workspace` input. Returns the real path of the folder or the reason it is refused.
   * @param {unknown} input
   * @returns {{ ok: true, root: string } | { ok: false, error: string }}
   */
  function checkWorkspaceInput(input) {
    if (typeof input !== 'string' || !path.isAbsolute(input)) return { ok: false, error: WORKSPACE_REFUSALS.notAbsolute };
    if (!folder(input)) return { ok: false, error: WORKSPACE_REFUSALS.notFolder };
    const r = realOf(input);
    if (r === path.parse(r).root) return { ok: false, error: WORKSPACE_REFUSALS.isRoot };
    let home = '';
    try {
      home = realOf((sources.home ?? homedir)());
    } catch {
      home = '';
    }
    if (home !== '' && r === home) return { ok: false, error: WORKSPACE_REFUSALS.isHome };
    if (r === own) return { ok: false, error: WORKSPACE_REFUSALS.isOwn };
    return { ok: true, root: r };
  }

  /**
   * A root exists: a given `workspace` must name the same folder.
   * @param {{ ok: true, root: string, source: 'roots' | 'env' | 'cwd' }} found
   * @param {unknown} workspace
   * @returns {RootResult}
   */
  function guard(found, workspace) {
    if (workspace === undefined) return found;
    if (typeof workspace !== 'string' || !folder(workspace) || realOf(workspace) !== realOf(found.root)) {
      return { ok: false, error: WORKSPACE_MISMATCH_MESSAGE };
    }
    return found;
  }

  return {
    /** Forget the cached MCP root (notifications/roots/list_changed). */
    invalidate() {
      cachedRoot = undefined;
    },
    /**
     * @param {unknown} [workspace] the optional `workspace` tool input
     * @returns {Promise<RootResult>}
     */
    async resolve(workspace) {
      if (sources.getRoots) {
        if (cachedRoot === undefined) {
          cachedRoot = null;
          try {
            const roots = (await sources.getRoots()) ?? [];
            cachedRoot = roots.find((r) => usable(r)) ?? null;
          } catch {
            cachedRoot = null;
          }
        }
        if (cachedRoot !== null) return guard({ ok: true, root: cachedRoot, source: 'roots' }, workspace);
      }
      const fromEnv = sources.env[WORKSPACE_ENV];
      if (typeof fromEnv === 'string' && usable(fromEnv)) return guard({ ok: true, root: fromEnv, source: 'env' }, workspace);
      const cwd = sources.cwd();
      if (folder(cwd) && notOwn(cwd)) return guard({ ok: true, root: cwd, source: 'cwd' }, workspace);
      if (workspace === undefined) return { ok: false, error: ROOT_UNKNOWN_MESSAGE };
      const checked = checkWorkspaceInput(workspace);
      return checked.ok ? { ok: true, root: checked.root, source: 'workspace' } : checked;
    },
  };
}

/**
 * First `file://` root of a `roots/list` answer as a local path (the caller checks that it is a folder).
 * @param {{ uri: string }[]} roots
 * @returns {string[]}
 */
export function localRoots(roots) {
  /** @type {string[]} */
  const out = [];
  for (const r of roots) {
    if (typeof r?.uri !== 'string' || !r.uri.startsWith('file://')) continue;
    try {
      out.push(fileURLToPath(r.uri));
    } catch {
      // not a local file URL
    }
  }
  return out;
}

