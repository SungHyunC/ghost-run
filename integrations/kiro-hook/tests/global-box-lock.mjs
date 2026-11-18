// vitest globalSetup. Serializes the test runs of every package that can use the real Docker box.
// Several tests count containers and volumes that carry the ghost-run labels before and after a run.
// A second package running at the same time (for example `pnpm -r test`) starts containers of its own,
// so those counts and the runner's own cleanup disagree. One lock per machine fixes this: a package
// run takes it in setup and drops it in teardown. The lock is a directory in the OS temp folder;
// a lock whose owner process is gone, or that is older than STALE_MS, is taken over.
// The same file lives in integrations/kiro-hook/tests and integrations/mcp/tests. Keep them identical.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOCK_DIR = join(tmpdir(), 'ghost-run-box-tests.lock');
const OWNER_FILE = join(LOCK_DIR, 'owner');
const POLL_MS = 500;
const WAIT_LIMIT_MS = 40 * 60_000;
const STALE_MS = 60 * 60_000;

/** @returns {boolean} true when a Docker daemon answers; without one no test uses the box. */
function dockerReachable() {
  const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', timeout: 20_000 });
  return r.error === undefined && r.status === 0;
}

/** @param {number} pid */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return /** @type {NodeJS.ErrnoException} */ (e).code === 'EPERM';
  }
}

function lockIsStale() {
  try {
    const pid = Number.parseInt(readFileSync(OWNER_FILE, 'utf8'), 10);
    if (Number.isInteger(pid) && !alive(pid)) return true;
  } catch {
    // The owner file is written right after mkdir; a missing file falls through to the age check.
  }
  try {
    return Date.now() - statSync(LOCK_DIR).mtimeMs > STALE_MS;
  } catch {
    return true;
  }
}

function release() {
  try {
    if (readFileSync(OWNER_FILE, 'utf8').trim() === String(process.pid)) rmSync(LOCK_DIR, { recursive: true, force: true });
  } catch {
    // Not ours or already gone.
  }
}

export async function setup() {
  if (!dockerReachable()) return undefined;
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      writeFileSync(OWNER_FILE, String(process.pid));
      break;
    } catch (e) {
      if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'EEXIST') throw e;
      if (lockIsStale()) {
        rmSync(LOCK_DIR, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - start > WAIT_LIMIT_MS) throw new Error(`box test lock still held after ${WAIT_LIMIT_MS} ms: ${LOCK_DIR}`);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
  process.once('exit', release);
  return release;
}
