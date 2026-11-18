// Lock-file semaphore (Requirement 8, design D9): at most SEMAPHORE_SLOTS rehearsals run at once.
// A slot is a file created with the exclusive flag. A slot whose recorded process no longer exists is
// reclaimed. The slot is released on every exit path of `withSlot`.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { SEMAPHORE_SLOTS, SEMAPHORE_WAIT_MS } from '../../gate-config.mjs';

/** Fixed line for a caller that waited the whole time without a slot. */
export const BUSY_LINE = 'GHOST RUN GATE BUSY: other rehearsals are still running; the tool call was not allowed.';

const POLL_MS = 100;

/** @param {number} pid */
function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (/** @type {any} */ err) {
    return err?.code === 'EPERM';
  }
}

/** @param {number} ms */
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @typedef {object} SemaphoreOptions
 * @property {string} dir Folder that holds the slot files (the Ghost_Store `locks` folder).
 * @property {number} [slots]
 * @property {number} [waitMs]
 * @property {number} [pollMs]
 * @property {number} [pid] Process id recorded in the slot (default: this process).
 * @property {(pid: number) => boolean} [isAlive]
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {() => number} [now]
 */

/**
 * @param {string} file
 * @param {number} pid
 * @returns {Promise<boolean>} true when this call created the slot file
 */
async function tryCreate(file, pid) {
  try {
    const fh = await fsp.open(file, 'wx', 0o600);
    try {
      await fh.writeFile(JSON.stringify({ pid }));
    } finally {
      await fh.close();
    }
    return true;
  } catch (/** @type {any} */ err) {
    if (err?.code === 'EEXIST') return false;
    throw err;
  }
}

/**
 * Remove a slot file when the process recorded in it is gone. An unreadable or malformed slot
 * is left alone unless it is empty for a moment (a creator between open and write), which is not stale.
 * @param {string} file
 * @param {(pid: number) => boolean} isAlive
 */
async function reclaimIfStale(file, isAlive) {
  let text;
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch {
    return;
  }
  let pid;
  try {
    const parsed = JSON.parse(text);
    pid = parsed?.pid;
  } catch {
    return;
  }
  if (!Number.isInteger(pid) || pid < 1) return;
  if (!isAlive(pid)) await fsp.rm(file, { force: true });
}

/** @param {string} file */
function held(file) {
  let released = false;
  return {
    acquired: /** @type {const} */ (true),
    release: async () => {
      if (released) return;
      released = true;
      await fsp.rm(file, { force: true });
    },
  };
}

/**
 * Try to take a slot, waiting at most `waitMs`.
 * @param {SemaphoreOptions} opts
 * @returns {Promise<{ acquired: true, release: () => Promise<void> } | { acquired: false, line: string }>}
 */
export async function acquireSlot(opts) {
  const slots = opts.slots ?? SEMAPHORE_SLOTS;
  const waitMs = opts.waitMs ?? SEMAPHORE_WAIT_MS;
  const pollMs = opts.pollMs ?? POLL_MS;
  const pid = opts.pid ?? process.pid;
  const isAlive = opts.isAlive ?? processExists;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? (() => performance.now());
  await fsp.mkdir(opts.dir, { recursive: true, mode: 0o700 });
  const deadline = now() + waitMs;
  for (;;) {
    for (let i = 0; i < slots; i++) {
      const file = path.join(opts.dir, `slot-${i}.lock`);
      if (await tryCreate(file, pid)) return held(file);
      await reclaimIfStale(file, isAlive);
      if (await tryCreate(file, pid)) return held(file);
    }
    if (now() >= deadline) return { acquired: false, line: BUSY_LINE };
    await sleep(Math.min(pollMs, Math.max(1, deadline - now())));
  }
}

/**
 * Run `fn` while holding a slot; the slot is released when `fn` returns or throws.
 * @template T
 * @param {SemaphoreOptions} opts
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ busy: false, value: T } | { busy: true, line: string }>}
 */
export async function withSlot(opts, fn) {
  const slot = await acquireSlot(opts);
  if (!slot.acquired) return { busy: true, line: slot.line };
  try {
    return { busy: false, value: await fn() };
  } finally {
    await slot.release();
  }
}
