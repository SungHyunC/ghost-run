// Gate output (Requirements 7 and 9): maps a RunResult to the hook decision and builds the texts.
// Pure: no I/O, no clock, no environment read, and the command text is not an input.
// Fail closed: the exit code is 0 or 2, and 0 only for a pass or for the `ask` JSON of a warn.
import { compareCodePoints, renderMessage, sanitizeJudgeText } from '@ghost-run/core';
import { WARN_MODE } from '../../gate-config.mjs';

/** @typedef {import('@ghost-run/ghost-runner').RunResult} RunResult */
/** @typedef {import('@ghost-run/core').WardVerdict} WardVerdict */
/** @typedef {import('@ghost-run/core').Verdict} Verdict */
/** @typedef {import('@ghost-run/core').Change} Change */
/** @typedef {{ kind: 'allow' | 'ask' | 'deny', exit: 0 | 2, stdout: string, stderr: string, grave?: object, stats: string[] }} GateDecision */
/**
 * @typedef {object} DecisionContext
 * @property {number} wardCount Number of wards of the loaded ward set.
 * @property {string} [graveId] Grave id used in the Seance_Link.
 * @property {string} [seanceBase] Value of GHOST_RUN_SEANCE_BASE (the caller reads the environment).
 * @property {'exit2' | 'ask'} [warnMode] Default: WARN_MODE of gate-config.mjs.
 */

/** Longest diff summary and ask reason, in code points. */
export const MAX_TEXT_CODE_POINTS = 1200;

/** Most path lines of a diff summary. */
export const MAX_DIFF_LINES = 10;

/** Fixed line added in Plan_B (Requirement 9). */
export const PLAN_B_LINE = 'P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.';

/** Fixed line when the runner rejected or reported an internal error. */
export const RUNNER_FAILED_LINE = 'GHOST RUN GATE ERROR: runner-failed; the tool call was not allowed.';

/** Fixed line when the RunResult is missing or malformed. */
export const BAD_RESULT_LINE = 'GHOST RUN GATE ERROR: bad-result; the tool call was not allowed.';

/** One fixed line per floor reason, keyed by runner status or diagnostic name. No input text. */
export const FLOOR_TEXT = Object.freeze({
  'recorder-failure': 'The event recorder failed; network and secret-read checks may be incomplete.',
  'sqlite-unreadable': 'A SQLite file could not be read; row-loss checks may be incomplete.',
  'secret-values-unreadable': 'A secret file could not be read; content checks may be incomplete.',
  'protected-path-excluded': 'A protected path was left out of the copy; changes there were not rehearsed.',
  'external-change': 'The original files changed during the run; the result may not match reality.',
  'isolation-violation': 'The run reached files outside the copy; the result is not trusted.',
  'copy-timeout': 'Copying the workspace took too long; the rehearsal did not finish.',
  'pipeline-deadline': 'The rehearsal ran out of time; the result is incomplete.',
  timeout: 'The command timed out during the rehearsal; the result is incomplete.',
});

/** Order in which floor lines are written. */
const FLOOR_ORDER = Object.keys(FLOOR_TEXT);

const RANK = Object.freeze({ pass: 0, warn: 1, block: 2 });

/**
 * @param {unknown} v
 * @returns {v is Verdict}
 */
function isVerdict(v) {
  return v === 'pass' || v === 'warn' || v === 'block';
}

/**
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
function cutCodePoints(s, max) {
  const cps = [...s];
  return cps.length <= max ? s : cps.slice(0, max).join('');
}

/**
 * The `ask` JSON of a warn. The reason is sanitized and cut to 1,200 code points.
 * @param {string} reason
 * @returns {string}
 */
export function askJson(reason) {
  const text = sanitizeJudgeText(String(reason), MAX_TEXT_CODE_POINTS);
  return JSON.stringify({
    hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: text },
  });
}

/**
 * @param {unknown} n
 * @returns {number}
 */
function rowsOf(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * Summary of the changes of all steps: counts per kind and at most 10 path lines.
 * @param {ReadonlyArray<ReadonlyArray<Change>>} changesPerStep
 * @returns {string} at most 1,200 code points
 */
export function diffSummary(changesPerStep) {
  let deleted = 0;
  let overwritten = 0;
  let created = 0;
  let symlinks = 0;
  let rowsLost = 0;
  /** @type {{ kind: string, path: string }[]} */
  const items = [];
  for (const step of Array.isArray(changesPerStep) ? changesPerStep : []) {
    for (const c of Array.isArray(step) ? step : []) {
      if (c === null || typeof c !== 'object') continue;
      const kind = c.kind;
      if (kind === 'sql-row-count') {
        const before = rowsOf(c.rowsBefore);
        const after = rowsOf(c.rowsAfter);
        rowsLost += c.dropped === true ? Math.max(0, before) : Math.max(0, before - after);
        continue;
      }
      if (kind === 'file-deleted') deleted++;
      else if (kind === 'file-overwritten') overwritten++;
      else if (kind === 'file-created') created++;
      else if (kind === 'symlink-changed') symlinks++;
      else continue;
      items.push({ kind, path: sanitizeJudgeText(typeof c.path === 'string' ? c.path : '') });
    }
  }
  items.sort((a, b) => compareCodePoints(a.path, b.path) || compareCodePoints(a.kind, b.kind));
  const header = `Diff summary: ${deleted} deleted, ${overwritten} overwritten, ${created} created, ${symlinks} symlinks changed, ${rowsLost} rows lost.`;
  const lines = items.slice(0, MAX_DIFF_LINES).map((i) => `  ${i.kind} ${i.path}`);
  for (;;) {
    const more = items.length - lines.length;
    const all = [header, ...lines, ...(more > 0 ? [`+${more} more changes.`] : [])];
    const text = all.join('\n');
    if ([...text].length <= MAX_TEXT_CODE_POINTS || lines.length === 0) return cutCodePoints(text, MAX_TEXT_CODE_POINTS);
    lines.pop();
  }
}

/**
 * @param {string} line
 * @returns {GateDecision}
 */
function failClosed(line) {
  return { kind: 'deny', exit: 2, stdout: '', stderr: line, stats: [] };
}

/**
 * Floor reasons of a result, in the fixed order of FLOOR_TEXT. Only known keys; no input text.
 * @param {RunResult} result
 * @returns {string[]}
 */
function floorKeys(result) {
  const found = new Set();
  if (typeof result.status === 'string') found.add(result.status);
  const diags = Array.isArray(result.diagnostics) ? result.diagnostics : [];
  for (const d of diags) if (d && typeof d.name === 'string') found.add(d.name);
  const oc = result.originalChange;
  if (oc && typeof oc.classification === 'string') found.add(oc.classification);
  return FLOOR_ORDER.filter((k) => found.has(k));
}

/**
 * Map a RunResult to the gate decision (the table of the design).
 * @param {RunResult} result
 * @param {DecisionContext} ctx
 * @returns {GateDecision}
 */
export function decisionFromRunResult(result, ctx) {
  try {
    if (result === null || typeof result !== 'object' || !isVerdict(result.verdict)) return failClosed(BAD_RESULT_LINE);
    if (result.status === 'internal-error') return failClosed(RUNNER_FAILED_LINE);
    const iso = result.isolation;
    if (iso === null || typeof iso !== 'object') return failClosed(BAD_RESULT_LINE);
    const planB = iso.mode === 'static-analysis';
    const warnMode = (ctx?.warnMode ?? WARN_MODE) === 'ask' ? 'ask' : 'exit2';
    const wardCount = Number.isInteger(ctx?.wardCount) && ctx.wardCount >= 0 ? ctx.wardCount : 0;

    /** @type {WardVerdict} */
    const ward = result.wardVerdict ?? { verdict: 'pass', violations: [], notices: [] };
    if (!isVerdict(ward.verdict)) return failClosed(BAD_RESULT_LINE);

    // A run that did not finish normally, and Plan B, are never a pass.
    let effective = RANK[result.verdict] >= RANK[ward.verdict] ? result.verdict : ward.verdict;
    if ((result.status !== 'ok' || planB) && effective === 'pass') effective = 'warn';

    if (effective === 'pass') {
      const claims = { p5: iso.p5Claimed === true, p6: iso.p6Claimed === true };
      const text = renderMessage(ward, { wardCount, claims });
      return { kind: 'allow', exit: 0, stdout: text, stderr: '', stats: [] };
    }

    const claims = planB
      ? { p5: false, p6: false }
      : { p5: iso.p5Claimed === true, p6: iso.p6Claimed === true };
    const seance =
      typeof ctx?.graveId === 'string'
        ? { id: ctx.graveId, ...(typeof ctx.seanceBase === 'string' ? { base: ctx.seanceBase } : {}) }
        : undefined;
    const shown = effective === ward.verdict ? ward : { ...ward, verdict: effective };
    const lines = [renderMessage(shown, { wardCount, claims, ...(seance ? { seance } : {}) })];
    if (effective !== ward.verdict || planB) {
      for (const key of floorKeys(result)) {
        lines.push(FLOOR_TEXT[/** @type {keyof typeof FLOOR_TEXT} */ (key)]);
      }
    }
    if (planB) lines.push(PLAN_B_LINE);
    lines.push(diffSummary(result.report?.changes ?? []));
    const text = lines.join('\n');

    if (effective === 'warn' && warnMode === 'ask') {
      return { kind: 'ask', exit: 0, stdout: askJson(lines.join(' ')), stderr: '', stats: [] };
    }
    return { kind: 'deny', exit: 2, stdout: '', stderr: text, stats: [] };
  } catch {
    return failClosed(BAD_RESULT_LINE);
  }
}
