// contract-pbt main (Requirement 15): reads the file event, selects the suites,
// runs them, and returns the text for STDOUT and STDERR plus the exit code.
// Exit codes: 0 = passed or nothing to run, 1 = a property failed or the run
// is incomplete at the deadline (the design of contract-pbt; this hook never
// blocks a tool call, so the 0/2 rule of the blocking hooks does not apply).
// The STDOUT text does not reach the agent in the CLI (probe, CLI 3.4.0);
// .ghost-run/pbt/last.json is the channel there. IDE result pending: recheck
// after IDE confirmation (task 1.4).
import path from 'node:path';
import { extractFilePath } from '../file-event.mjs';
import { realSpawn, runSuites } from './run.mjs';
import { selectSuites } from './select.mjs';

/** Fixed line when the hook itself fails (no input text is echoed). */
export const INTERNAL_ERROR_LINE = 'GHOST RUN CONTRACT-PBT ERROR: internal-error; no result was written.';

/**
 * @param {import('./run.mjs').PbtSummary} s
 * @returns {string}
 */
export function formatSummary(s) {
  const secs = (s.elapsedMs / 1000).toFixed(1);
  const lines = [
    `contract-pbt: ${s.outcome} (${s.suites.join(', ') || 'no suites'}) passed=${s.passed} failed=${s.failed.length} skipped=${s.skipped.length} elapsed=${secs}s`,
  ];
  if (s.reason === 'deadline') {
    lines.push('incomplete: deadline reached');
    for (const n of s.unfinished) lines.push(`  not finished: ${n}`);
  } else if (s.note) {
    lines.push(`note: ${s.note}`);
  }
  for (const k of s.skipped) lines.push(`  ${k}`);
  for (const f of s.failed) lines.push(`  FAILED ${f.id} (criterion ${f.criterion})`);
  lines.push('evidence at the configured example count per property, not a proof');
  return `${lines.join('\n')}\n`;
}

/**
 * @param {import('./run.mjs').FailedProperty[]} failed
 * @returns {string}
 */
export function formatFailures(failed) {
  return failed
    .map(
      (f) =>
        `PROPERTY FAILED: ${f.id}\n  counterexample: ${f.counterexample}\n  criterion: ${f.criterion}\n  seed: ${f.seed === null ? 'unknown' : f.seed}\n`,
    )
    .join('');
}

/**
 * @param {string} stdinText
 * @param {Partial<import('./run.mjs').RunDeps>} [over]
 * @returns {Promise<{ exit: number, stdout: string, stderr: string }>}
 */
export async function run(stdinText, over = {}) {
  /** @type {unknown} */
  let event;
  try {
    event = JSON.parse(stdinText);
  } catch {
    return { exit: 0, stdout: '', stderr: '' };
  }
  const cwd = /** @type {any} */ (event)?.cwd;
  const root = over.root ?? (typeof cwd === 'string' && path.isAbsolute(cwd) ? cwd : process.cwd());
  const rel = extractFilePath(event, root);
  const sel = selectSuites(rel);
  if (sel.kind === 'none') return { exit: 0, stdout: '', stderr: '' };
  const { summary, superseded } = await runSuites(sel, { spawn: realSpawn, ...over, root });
  if (superseded) return { exit: 0, stdout: '', stderr: '' };
  const bad = summary.outcome === 'failed' || summary.reason === 'deadline';
  return {
    exit: bad ? 1 : 0,
    stdout: formatSummary(summary),
    stderr: formatFailures(summary.failed),
  };
}
