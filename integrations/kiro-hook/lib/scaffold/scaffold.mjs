// World scaffold: create the missing registration files of a new world (Requirement 16).
// Files that exist are never overwritten, truncated, or deleted (each file is opened with 'wx').
// No network call and no LLM call.

import { lstat, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { SCAFFOLD_FILES, WORLD_NAME_PATTERN, renderTemplates } from './templates.mjs';

/**
 * @typedef {{
 *   status: 'created' | 'noop' | 'ignored' | 'invalid-name' | 'rejected' | 'error',
 *   name?: string,
 *   created: string[],
 *   existing: string[],
 *   message: string,
 * }} ScaffoldResult
 */

export const NAME_RULE_MESSAGE =
  'world-scaffold: the world name must match ^[a-z][a-z0-9-]{0,63}$ (lower case letters, digits, and hyphen; at most 64 characters). No file was created.';

/** Printed after a scaffold that created files (Requirement 16 criterion 8). */
export const NEXT_STEP = 'next step: implement the six functions, then save to run contract-pbt';

/**
 * Check that a path component is a real folder (or absent).
 * @param {string} dir
 * @returns {Promise<'absent' | 'dir' | 'bad'>}
 */
async function componentState(dir) {
  try {
    const st = await lstat(dir);
    return st.isDirectory() && !st.isSymbolicLink() ? 'dir' : 'bad';
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return 'absent';
    throw err;
  }
}

/**
 * Make a folder below the root, one component at a time, rejecting symbolic links.
 * @param {string} root
 * @param {string[]} components
 * @returns {Promise<boolean>} false when a component is a symbolic link or not a folder
 */
async function ensureDirs(root, components) {
  let cur = root;
  for (const c of components) {
    cur = join(cur, c);
    let state = await componentState(cur);
    if (state === 'absent') {
      try {
        await mkdir(cur);
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'EEXIST') throw err;
      }
      state = await componentState(cur);
    }
    if (state !== 'dir') return false;
  }
  return true;
}

/**
 * Create one file only if it does not exist.
 * @param {string} abs
 * @param {string} text
 * @returns {Promise<boolean>} true when created, false when it already existed
 */
async function createIfMissing(abs, text) {
  /** @type {import('node:fs/promises').FileHandle} */
  let fh;
  try {
    fh = await open(abs, 'wx', 0o644);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EEXIST') return false;
    throw err;
  }
  try {
    await fh.writeFile(text, 'utf8');
  } finally {
    await fh.close();
  }
  return true;
}

/**
 * Scaffold the world that owns a file path.
 * @param {string} root absolute workspace root
 * @param {string | null} relPath workspace-relative path of the created file (`/` separators)
 * @returns {Promise<ScaffoldResult>}
 */
export async function scaffoldWorld(root, relPath) {
  /** @type {ScaffoldResult} */
  const none = { status: 'ignored', created: [], existing: [], message: '' };
  if (typeof relPath !== 'string') return none;
  const m = /^worlds\/([^/]+)\//.exec(relPath);
  if (m === null) return none;
  const name = m[1];
  if (!WORLD_NAME_PATTERN.test(name)) {
    return { status: 'invalid-name', created: [], existing: [], message: NAME_RULE_MESSAGE };
  }
  if (relPath.split('/').some((s) => s === '..' || s.includes('\\'))) {
    return {
      status: 'rejected',
      name,
      created: [],
      existing: [],
      message: 'world-scaffold: the path contains a parent reference or a separator. No file was created.',
    };
  }
  /** @type {ScaffoldResult} */
  const result = { status: 'noop', name, created: [], existing: [], message: '' };
  try {
    const okWorld = await ensureDirs(root, ['worlds', name]);
    const okTests = okWorld && (await ensureDirs(root, ['worlds', name, 'tests']));
    if (!okTests) {
      return {
        status: 'rejected',
        name,
        created: [],
        existing: [],
        message:
          'world-scaffold: a folder of the world path is a symbolic link or not a folder. No file was created.',
      };
    }
    const texts = renderTemplates(name);
    for (const file of SCAFFOLD_FILES) {
      const made = await createIfMissing(join(root, 'worlds', name, ...file.split('/')), texts[file]);
      (made ? result.created : result.existing).push(file);
    }
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    return {
      status: 'error',
      name,
      created: result.created,
      existing: result.existing,
      message: `world-scaffold: could not finish (${typeof code === 'string' ? code : 'error'}).`,
    };
  }
  if (result.created.length > 0) {
    result.status = 'created';
    result.message = `world-scaffold: created ${result.created.map((f) => `worlds/${name}/${f}`).join(', ')}\n${NEXT_STEP}`;
  } else {
    result.message = `world-scaffold: worlds/${name}/ already has every scaffold file. Nothing to do.`;
  }
  return result;
}
