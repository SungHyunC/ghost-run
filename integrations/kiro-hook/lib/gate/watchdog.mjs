// Watchdog of the gate process (Requirement 8): if no verdict exists after `ms`, clean up the runner's
// leftovers, print the fixed timeout line, and exit 2. The timer is ref'ed so it keeps the process alive.
import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RUN_ID_RE } from '@ghost-run/ghost-runner';
import { RUNNER_SUPPORTS_RUN_ID, WATCHDOG_MS } from '../../gate-config.mjs';

/** Fixed line printed when the watchdog fires. */
export const TIMEOUT_LINE = 'GHOST RUN GATE TIMEOUT: no verdict within 50 s; the tool call was not allowed.';

/** Label the runner puts on every box of a run (ghost-runner `LABEL_RUN_ID`). */
export const RUN_ID_LABEL = 'ghost-run.run-id';

/** Own timeout of each cleanup command, in milliseconds. */
const CLEANUP_TIMEOUT_MS = 4_000;

/**
 * Runner budget in seconds for a gate that has used `elapsedSec` already.
 * @param {number} elapsedSec
 * @returns {number}
 */
export function runnerBudgetSec(elapsedSec) {
  const e = Number.isFinite(elapsedSec) ? elapsedSec : 0;
  return Math.max(5, Math.min(44, Math.floor(48 - e)));
}

/**
 * Run one command with an argument array (never a shell string). Never rejects.
 * @param {string} file
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {Promise<string>} stdout, or '' on any error
 */
function run(file, args, timeoutMs) {
  return new Promise((resolve) => {
    try {
      execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1_048_576 }, (err, stdout) => {
        resolve(err ? '' : String(stdout));
      });
    } catch {
      resolve('');
    }
  });
}

/**
 * Remove every container that carries the run-id label, and the run's folder under the temp directory.
 * Errors are swallowed. A run id that does not match the runner's pattern is ignored.
 * @param {string} runId
 * @param {{ tmpdir?: string, runCommand?: typeof run, timeoutMs?: number }} [deps]
 * @returns {Promise<void>}
 */
export async function cleanupRun(runId, deps = {}) {
  if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) return;
  const runCommand = deps.runCommand ?? run;
  const timeoutMs = deps.timeoutMs ?? CLEANUP_TIMEOUT_MS;
  try {
    const ids = (await runCommand('docker', ['ps', '-aq', '--filter', `label=${RUN_ID_LABEL}=${runId}`], timeoutMs))
      .split(/\s+/)
      .filter((id) => /^[0-9a-f]{12,64}$/.test(id));
    if (ids.length > 0) await runCommand('docker', ['rm', '-f', '-v', ...ids], timeoutMs);
  } catch {
    // swallowed
  }
  try {
    await fsp.rm(path.join(deps.tmpdir ?? os.tmpdir(), 'ghost-run', runId), { recursive: true, force: true });
  } catch {
    // swallowed
  }
}

/**
 * @typedef {object} WatchdogOptions
 * @property {number} [ms]
 * @property {() => void | Promise<void>} [onFire] Runs first; its errors are swallowed.
 * @property {(line: string) => void} [print] Default: write to stderr.
 * @property {(code: number) => void} [exit] Default: process.exit.
 */

/**
 * Arm the watchdog. `onFire` requests the cleanup; then the timeout line is printed and the process exits 2.
 * @param {WatchdogOptions} [opts]
 * @returns {{ disarm: () => void }}
 */
export function armWatchdog(opts = {}) {
  const ms = opts.ms ?? WATCHDOG_MS;
  const print = opts.print ?? ((line) => process.stderr.write(line + '\n'));
  const exit = opts.exit ?? ((code) => process.exit(code));
  let done = false;
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    void (async () => {
      try {
        await opts.onFire?.();
      } catch {
        // swallowed: the exit must still happen
      }
      try {
        print(TIMEOUT_LINE);
      } catch {
        // swallowed
      }
      exit(2);
    })();
  }, ms);
  return {
    disarm() {
      done = true;
      clearTimeout(timer);
    },
  };
}

/**
 * Arm the watchdog of a gate run. With `RUNNER_SUPPORTS_RUN_ID` the cleanup removes the run's boxes by label
 * and its temp folder; the injected `cleanup` replaces the real one in tests.
 * @param {{ runId?: string, ms?: number, cleanup?: (runId: string) => Promise<void>, print?: (line: string) => void, exit?: (code: number) => void, supportsRunId?: boolean }} [opts]
 */
export function armGateWatchdog(opts = {}) {
  const supports = opts.supportsRunId ?? RUNNER_SUPPORTS_RUN_ID;
  const cleanup = opts.cleanup ?? cleanupRun;
  const runId = opts.runId;
  return armWatchdog({
    ...(opts.ms === undefined ? {} : { ms: opts.ms }),
    ...(opts.print ? { print: opts.print } : {}),
    ...(opts.exit ? { exit: opts.exit } : {}),
    onFire: async () => {
      if (supports && typeof runId === 'string') await cleanup(runId);
    },
  });
}
