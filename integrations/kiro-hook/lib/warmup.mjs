// Docker warm-up. Docker Desktop's Resource Saver stops its VM after five idle minutes, and the next
// engine call then takes about two seconds while the VM starts. This starts one detached, harmless
// `docker` call so the VM is awake before the gate's first check. It never waits for the call, never
// prints, and never throws. A stamp file in the temp folder limits it to one call per THROTTLE_MS.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const nowMs = () => performance.timeOrigin + performance.now();

/** No second warm-up call inside this window, in milliseconds (well under Resource Saver's five minutes). */
export const THROTTLE_MS = 60_000;

/**
 * The detached call: a cheap engine round trip that wakes a stopped VM. `docker version` does not
 * do this on Docker Desktop (the proxy answers it without starting the engine); `docker info` does.
 */
export const WARMUP_ARGS = Object.freeze(['info', '--format', '{{.ServerVersion}}']);

/**
 * @typedef {object} WarmupDeps
 * @property {typeof spawn} [spawn]
 * @property {() => number} [now] Milliseconds since the epoch.
 * @property {string} [tmp] Folder for the stamp file. Default: the OS temp folder.
 */

/**
 * @param {string} tmp @param {string} cwd
 * @returns {string}
 */
function stampPath(tmp, cwd) {
  const key = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
  return join(tmp, 'ghost-run', `warmup-${key}.stamp`);
}

/**
 * Start the detached docker call unless one started less than THROTTLE_MS ago.
 * @param {string} cwd
 * @param {WarmupDeps} [deps]
 * @returns {boolean} true when a process was started
 */
export function warmUp(cwd, deps = {}) {
  try {
    const now = (deps.now ?? nowMs)();
    const stamp = stampPath(deps.tmp ?? tmpdir(), cwd);
    try {
      if (now - statSync(stamp).mtimeMs < THROTTLE_MS) return false;
    } catch {
      // no stamp yet
    }
    mkdirSync(join(stamp, '..'), { recursive: true });
    writeFileSync(stamp, '');
    utimesSync(stamp, now / 1000, now / 1000);
    const child = (deps.spawn ?? spawn)('docker', [...WARMUP_ARGS], {
      detached: true,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    });
    child.on?.('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
