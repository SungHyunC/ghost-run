// Ghost_Store: the only module that writes under .ghost-run/. Folders are
// created with mode 0700 and files with 0600. Reading functions are pure over
// file contents; file access is in the thin adapter functions below.
import { randomBytes } from 'node:crypto';
import { constants as fsc } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { STORE_CAPS } from '../../gate-config.mjs';
import { redactCanaries } from './redact.mjs';

export { sessionKey } from './session-key.mjs';
export { containsCanary, loadCanaries, redactCanaries } from './redact.mjs';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/**
 * @typedef {{ ok: true } | { ok: false, failure: string }} WriteResult
 * Failure classes: permission-denied, no-space, path-invalid, read-only,
 * io-error, too-large, invalid-line, short-write.
 */
/**
 * @typedef {{
 *   dir: string, graveyard: string, stats: string, runs: string, sessions: string,
 *   pbt: string, blacklight: string, probe: string, locks: string,
 * }} StorePaths
 */

/**
 * Locations of the Ghost_Store for a workspace root. `approvals/` is not part
 * of the layout (design D1).
 * @param {string} root workspace root
 * @returns {StorePaths}
 */
export function storePaths(root) {
  const dir = path.join(root, '.ghost-run');
  return {
    dir,
    graveyard: path.join(dir, 'graveyard.jsonl'),
    stats: path.join(dir, 'stats.jsonl'),
    runs: path.join(dir, 'runs'),
    sessions: path.join(dir, 'sessions'),
    pbt: path.join(dir, 'pbt'),
    blacklight: path.join(dir, 'blacklight'),
    probe: path.join(dir, 'probe'),
    locks: path.join(dir, 'locks'),
  };
}

/**
 * Folder and provenance file of one session.
 * @param {string} root
 * @param {string} key a Session_Key
 * @returns {{ dir: string, provenance: string }}
 */
export function sessionPaths(root, key) {
  const dir = path.join(storePaths(root).sessions, key);
  return { dir, provenance: path.join(dir, 'provenance.jsonl') };
}

/**
 * Map a file-system error to a failure class. No path or message is kept.
 * @param {unknown} err
 * @returns {string}
 */
export function failureClass(err) {
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
  if (code === 'EACCES' || code === 'EPERM') return 'permission-denied';
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'no-space';
  if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR' || code === 'EEXIST') return 'path-invalid';
  if (code === 'EROFS') return 'read-only';
  return 'io-error';
}

/**
 * Append one line with a single write to a descriptor opened with O_APPEND.
 * A line over the record cap is not written. Never throws.
 * @param {string} file
 * @param {string} line without a line terminator
 * @returns {Promise<WriteResult>}
 */
export async function appendLine(file, line) {
  if (line.includes('\n')) return { ok: false, failure: 'invalid-line' };
  const data = Buffer.from(`${line}\n`, 'utf8');
  if (data.length - 1 > STORE_CAPS.recordBytes) return { ok: false, failure: 'too-large' };
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true, mode: DIR_MODE });
    const fh = await fsp.open(file, fsc.O_WRONLY | fsc.O_APPEND | fsc.O_CREAT, FILE_MODE);
    try {
      const { bytesWritten } = await fh.write(data, 0, data.length, null);
      if (bytesWritten !== data.length) return { ok: false, failure: 'short-write' };
    } finally {
      await fh.close();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, failure: failureClass(err) };
  }
}

/**
 * Pure: split file contents into complete lines. A final segment without a
 * line terminator is a torn line and is counted as corrupt, not returned.
 * Empty lines are ignored.
 * @param {string} text
 * @returns {{ lines: string[], corrupt: number }}
 */
export function readLines(text) {
  const parts = text.split('\n');
  const tail = /** @type {string} */ (parts.pop());
  const lines = parts.filter((p) => p !== '');
  return { lines, corrupt: tail === '' ? 0 : 1 };
}

/**
 * Read a file for the pure readers. A missing file reads as empty text.
 * @param {string} file
 * @returns {Promise<string>}
 */
export async function readText(file) {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return '';
    throw err;
  }
}

/**
 * Redact canaries, then append the text as one line. Every record that goes
 * to a .jsonl file passes through here.
 * @param {string} file
 * @param {string} text one line without a terminator
 * @param {readonly Uint8Array[]} canaries
 * @returns {Promise<WriteResult>}
 */
export async function storeWrite(file, text, canaries) {
  return appendLine(file, redactCanaries(text, canaries));
}

/**
 * Redact canaries, then replace a whole file (Run_Record, pbt/last.json,
 * blacklight/last.txt) through a temporary file and a rename.
 * @param {string} file
 * @param {string} text
 * @param {readonly Uint8Array[]} canaries
 * @returns {Promise<WriteResult>}
 */
export async function storeWriteFile(file, text, canaries) {
  const data = Buffer.from(redactCanaries(text, canaries), 'utf8');
  if (data.length > STORE_CAPS.recordBytes) return { ok: false, failure: 'too-large' };
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true, mode: DIR_MODE });
    await fsp.writeFile(tmp, data, { mode: FILE_MODE, flag: 'wx' });
    await fsp.rename(tmp, file);
    return { ok: true };
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    return { ok: false, failure: failureClass(err) };
  }
}

/**
 * Real sub-directories (not links) of a folder, with modification times.
 * @param {string} dir
 * @param {boolean} wantDirs true for folders, false for regular files
 * @returns {Promise<{ name: string, mtimeMs: number }[]>}
 */
async function listEntries(dir, wantDirs) {
  /** @type {string[]} */
  let names;
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  /** @type {{ name: string, mtimeMs: number }[]} */
  const out = [];
  for (const name of names) {
    try {
      const st = await fsp.lstat(path.join(dir, name));
      if (wantDirs ? st.isDirectory() : st.isFile()) out.push({ name, mtimeMs: st.mtimeMs });
    } catch {
      // Entry vanished: ignore.
    }
  }
  return out;
}

/**
 * Remove the oldest entries beyond `cap`. Ties break on the name.
 * @param {string} dir
 * @param {boolean} wantDirs
 * @param {number} cap
 * @param {(name: string) => boolean} accept
 * @returns {Promise<number>} number removed
 */
async function trimOldest(dir, wantDirs, cap, accept) {
  const entries = (await listEntries(dir, wantDirs)).filter((e) => accept(e.name));
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const excess = entries.slice(0, Math.max(0, entries.length - cap));
  for (const e of excess) await fsp.rm(path.join(dir, e.name), { recursive: true, force: true });
  return excess.length;
}

/**
 * Keep the last `cap` lines of a .jsonl file. Returns the number dropped.
 * @param {string} file
 * @param {number} cap
 * @returns {Promise<number>}
 */
async function trimLines(file, cap) {
  const text = await readText(file);
  if (text === '') return 0;
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  const kept = parts.filter((p) => p !== '');
  if (kept.length <= cap) return 0;
  const tail = kept.slice(kept.length - cap);
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await fsp.writeFile(tmp, tail.length > 0 ? `${tail.join('\n')}\n` : '', { mode: FILE_MODE, flag: 'wx' });
    await fsp.rename(tmp, file);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
  return kept.length - cap;
}

/**
 * Apply the Ghost_Store caps: session folders (oldest by modification time
 * first), Run_Records (oldest first), graveyard lines, and provenance records
 * per session. Never throws.
 * @param {string} root workspace root
 * @param {{ sessions: number, runs: number, graveyardLines: number, provenancePerSession: number }} [caps]
 * @returns {Promise<{ ok: boolean, failure?: string, removedSessions: number, removedRuns: number, droppedGraveyardLines: number, droppedProvenance: number }>}
 */
export async function enforceCaps(root, caps = STORE_CAPS) {
  const paths = storePaths(root);
  const result = { ok: true, removedSessions: 0, removedRuns: 0, droppedGraveyardLines: 0, droppedProvenance: 0 };
  /** @type {string | undefined} */
  let failure;
  /** @param {() => Promise<void>} step */
  const run = async (step) => {
    try {
      await step();
    } catch (err) {
      failure ??= failureClass(err);
    }
  };
  await run(async () => {
    result.removedSessions = await trimOldest(paths.sessions, true, caps.sessions, () => true);
  });
  await run(async () => {
    result.removedRuns = await trimOldest(paths.runs, false, caps.runs, (n) => n.endsWith('.json'));
  });
  await run(async () => {
    result.droppedGraveyardLines = await trimLines(paths.graveyard, caps.graveyardLines);
  });
  for (const s of await listEntries(paths.sessions, true)) {
    await run(async () => {
      result.droppedProvenance += await trimLines(
        path.join(paths.sessions, s.name, 'provenance.jsonl'),
        caps.provenancePerSession,
      );
    });
  }
  if (failure !== undefined) return { ...result, ok: false, failure };
  return result;
}
