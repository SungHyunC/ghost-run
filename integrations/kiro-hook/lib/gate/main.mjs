// Gate main (Requirement 8, design D3): loaded by the bootstrap `ghost-gate.mjs` through a dynamic import.
// Wires the real dependencies, calls `decide`, and returns the outcome for the bootstrap to write.
// It reads no environment variable except GHOST_RUN_WARDS_FILE and GHOST_RUN_SEANCE_BASE, and it reads no
// variable or workspace file that disables the gate. The semaphore slot and the payload map are released
// inside `judgeShell` on every path; the watchdog lives in the bootstrap and is ended by the process exit.
import { randomUUID } from 'node:crypto';
import { runPlan } from '@ghost-run/ghost-runner';
import { RUNNER_SUPPORTS_RUN_ID, STORE_CAPS, WARN_MODE } from '../../gate-config.mjs';
import { parseHookEvent } from '../event.mjs';
import { FATAL_LINES } from '../hook-io.mjs';
import { enforceCaps } from '../store/ghost-store.mjs';
import { createGateStore } from '../store/gate-store.mjs';
import { loadWardsForHook } from '../wards-file.mjs';
import { decide } from './decide.mjs';
import { cleanupRun } from './watchdog.mjs';
import { createNodeFsView } from './write-judgment.mjs';

/** Run id of the ghost run of this process; the watchdog cleanup uses it. */
let currentRunId = randomUUID();

/**
 * Cleanup that the bootstrap watchdog requests before it prints the timeout line.
 * Removes the boxes and the temp folder of this process's run. Never rejects.
 * @returns {Promise<void>}
 */
export async function cleanupOnTimeout() {
  try {
    if (RUNNER_SUPPORTS_RUN_ID) await cleanupRun(currentRunId);
  } catch {
    // swallowed: the exit must still happen
  }
}

/**
 * Judge one hook call.
 * @param {string} stdinText
 * @returns {Promise<{ exit: 0 | 2, stdout: string, stderr: string }>}
 */
export async function run(stdinText) {
  const startedSec = process.uptime();
  const parsed = parseHookEvent(stdinText);
  const root = parsed.ok ? parsed.event.cwd : process.cwd();
  // The first id that `decide` asks for is the one the watchdog already knows.
  let first = true;
  const uuid = () => {
    if (first) {
      first = false;
      return currentRunId;
    }
    return randomUUID();
  };
  const env = {
    GHOST_RUN_WARDS_FILE: process.env.GHOST_RUN_WARDS_FILE,
    GHOST_RUN_SEANCE_BASE: process.env.GHOST_RUN_SEANCE_BASE,
  };
  const decision = await decide(
    { stdin: stdinText, root, env, elapsedSec: () => process.uptime() - startedSec },
    {
      runPlan,
      loadWards: loadWardsForHook,
      fsView: createNodeFsView(),
      clock: () => Date.now(),
      uuid,
      warnMode: WARN_MODE,
      store: createGateStore(root),
    },
  );

  // Keep the Ghost_Store inside its caps. A failure here never changes the decision.
  try {
    await enforceCaps(root, STORE_CAPS);
  } catch {
    // swallowed
  }

  const stderr = decision.stderr === '' || decision.stderr.endsWith('\n') ? decision.stderr : `${decision.stderr}\n`;
  const exit = decision.exit === 0 ? 0 : 2;
  if (exit === 0 && decision.kind !== 'allow' && decision.kind !== 'ask') {
    return { exit: 2, stdout: '', stderr: `${FATAL_LINES['internal-error']}\n` };
  }
  return { exit, stdout: decision.stdout, stderr };
}
