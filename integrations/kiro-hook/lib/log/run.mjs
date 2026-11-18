// ghost-log main (Requirement 13): records what an agent read (provenance) and how many shell calls ran
// (Stats_Event `executed`). It never decides, never blocks, never writes a Grave_Entry, never reads the
// Provenance_Log, and never calls a network or an LLM. All writes go through the Ghost_Store module.
//
// Exit codes: 0 after a successful record or an intended skip, 1 on a failure. The failure class goes on
// STDERR and says nothing about the tool call.
import fsp from 'node:fs/promises';
import nodePath from 'node:path';
import { WARN_MODE } from '../../gate-config.mjs';
import { readGraveyard } from '../gate/grave.mjs';
import { buildSecretMatcher } from '../gate/safe-list.mjs';
import { buildProvenanceRecord, isOwnServerTool, isShellTool } from '../provenance-record.mjs';
import { appendLine, loadCanaries, redactCanaries, sessionKey, storePaths } from '../store/ghost-store.mjs';
import { isBlockedDuplicate } from '../store/grave-duplicate.mjs';
import { appendProvenance } from '../store/provenance.mjs';
import { statsLine } from '../store/stats.mjs';
import { loadWardsForHook } from '../wards-file.mjs';

/** Reasons that count as a Stats_Event `provenance-skipped` (the rules of Requirement 13). */
const COUNTED_SKIPS = new Set(['secret-path', 'canary', 'too-large', 'outside-workspace']);

/** @typedef {{ exit: 0 | 1, stderr: string }} LogOutcome */

/**
 * @param {string} failureClass
 * @returns {LogOutcome}
 */
export function failure(failureClass) {
  return { exit: 1, stderr: `GHOST RUN LOG: ${failureClass}; no provenance was recorded.\n` };
}

/**
 * Bounded reader for the file fallback. Returns null for a file that is unreadable, resolves outside the
 * workspace, or resolves to a secret path.
 * @param {string} root
 * @param {{ test(path: string): { matched: boolean, escapes?: boolean } }} secretMatcher
 * @returns {(abs: string, max: number) => Promise<string | null>}
 */
export function createBoundedReader(root, secretMatcher) {
  return async (abs, max) => {
    try {
      const realRoot = await fsp.realpath(root);
      const real = await fsp.realpath(abs);
      const rel = nodePath.relative(realRoot, real);
      if (rel === '' || rel === '..' || rel.startsWith(`..${nodePath.sep}`) || nodePath.isAbsolute(rel)) return null;
      const m = secretMatcher.test(rel.split(nodePath.sep).join('/'));
      if (m.matched || m.escapes) return null;
      const fh = await fsp.open(real, 'r');
      try {
        const st = await fh.stat();
        if (!st.isFile()) return null;
        const buf = Buffer.alloc(Math.min(max, Math.max(st.size, 0)));
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        return buf.subarray(0, bytesRead).toString('utf8');
      } finally {
        await fh.close();
      }
    } catch {
      return null;
    }
  };
}

/**
 * @typedef {object} LogDeps
 * @property {string} cwd Workspace root when the event carries none.
 * @property {Record<string, string | undefined>} [env] Only `GHOST_RUN_WARDS_FILE` is read.
 * @property {() => number} nowMs Clock in epoch milliseconds (this module reads no clock of its own).
 * @property {typeof loadWardsForHook} [loadWards]
 * @property {'exit2' | 'ask'} [warnMode]
 */

/**
 * Handle one Post Tool Use event. Never throws.
 * @param {string} stdinText
 * @param {LogDeps} deps
 * @returns {Promise<LogOutcome>}
 */
export async function runLog(stdinText, deps) {
  try {
    return await runLogInner(stdinText, deps);
  } catch {
    return failure('internal-error');
  }
}

/**
 * @param {string} stdinText
 * @param {LogDeps} deps
 * @returns {Promise<LogOutcome>}
 */
async function runLogInner(stdinText, deps) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(stdinText);
  } catch {
    return failure('invalid-event');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return failure('invalid-event');
  const event = /** @type {Record<string, unknown>} */ (raw);
  if (event['hook_event_name'] !== 'PostToolUse') return failure('invalid-event');
  const toolName = event['tool_name'];
  const sessionId = event['session_id'];
  if (typeof toolName !== 'string' || typeof sessionId !== 'string') return failure('invalid-event');
  const root = typeof event['cwd'] === 'string' && event['cwd'] !== '' ? event['cwd'] : deps.cwd;
  const paths = storePaths(root);
  const clock = deps.nowMs;

  /** @param {import('../store/stats.mjs').StatsKind} kind */
  const stat = async (kind) => {
    const w = await appendLine(paths.stats, statsLine(kind, clock));
    return w.ok ? null : failure(w.failure);
  };

  // The tools of the ghost-run server are never recorded.
  if (isOwnServerTool(toolName)) return { exit: 0, stderr: '' };

  if (isShellTool(toolName)) {
    const input = event['tool_input'];
    const command =
      typeof input === 'object' && input !== null && typeof (/** @type {Record<string, unknown>} */ (input))['command'] === 'string'
        ? /** @type {string} */ (/** @type {Record<string, unknown>} */ (input)['command'])
        : null;
    if (command !== null) {
      // Design D10: skip the echo of a call the gate stopped (a blocked call may fire Post Tool Use on the IDE).
      const { entries } = await readGraveyard(paths.graveyard);
      /** @type {Uint8Array[]} */
      let canaries = [];
      if (entries.length > 0) {
        const loaded = await (deps.loadWards ?? loadWardsForHook)(root, deps.env ?? {});
        if (loaded.ok) canaries = await loadCanaries(root, loaded.wardSet);
      }
      if (
        entries.length > 0 &&
        isBlockedDuplicate({
          command,
          entries,
          nowMs: clock(),
          warnMode: deps.warnMode ?? WARN_MODE,
          redact: (t) => redactCanaries(t, canaries),
        })
      ) {
        return { exit: 0, stderr: '' };
      }
    }
    const failed = await stat('executed');
    return failed ?? { exit: 0, stderr: '' };
  }

  const loaded = await (deps.loadWards ?? loadWardsForHook)(root, deps.env ?? {});
  if (!loaded.ok) return failure('wards-file');
  const secretMatcher = buildSecretMatcher(loaded.wardSet);
  const canaries = await loadCanaries(root, loaded.wardSet);

  const built = await buildProvenanceRecord(event, {
    root,
    secretMatcher,
    canaries,
    readFile: createBoundedReader(root, secretMatcher),
  });
  if ('skip' in built) {
    if (COUNTED_SKIPS.has(built.skip)) {
      const failed = await stat('provenance-skipped');
      if (failed) return failed;
    }
    return { exit: 0, stderr: '' };
  }

  const w = await appendProvenance(root, sessionKey(sessionId), built.record, canaries);
  return w.ok ? { exit: 0, stderr: '' } : failure(w.failure);
}

/**
 * Stats and skip for a STDIN that is over the bound: nothing can be parsed, so count one skip.
 * @param {string} root
 * @param {() => number} nowMs
 * @returns {Promise<LogOutcome>}
 */
export async function recordOversized(root, nowMs) {
  const w = await appendLine(storePaths(root).stats, statsLine('provenance-skipped', nowMs));
  return w.ok ? { exit: 0, stderr: '' } : failure(w.failure);
}
