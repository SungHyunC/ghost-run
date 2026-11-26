// Gate decision (Requirements 3 to 10, 13, 14). `decide` is pure given its `deps`: it reads no environment
// variable, no clock, and no file except through `deps`. It never throws and never prints. Fail closed:
// every failure becomes a `deny` with exit 2. The gate emits no permission decision `allow`.
// The Provenance_Log is read only after the verdict is final, for the Grave_Entry `links`.
import path from 'node:path';
import { sanitizeJudgeText } from '@ghost-run/core';
import { RUN_ID_RE } from '@ghost-run/ghost-runner';
import { WARN_MODE } from '../../gate-config.mjs';
import { classifyTool, NOT_RECOGNIZED_MESSAGE, parseHookEvent } from '../event.mjs';
import { FATAL_LINES } from '../hook-io.mjs';
import { loadWardsForHook } from '../wards-file.mjs';
import { sessionKey } from '../store/ghost-store.mjs';
import { statsLine, utcSecond } from '../store/stats.mjs';
import { isApprovalCommand } from './approval-guard.mjs';
import { buildGraveEntry, graveLine } from './grave.mjs';
import { decisionFromRunResult } from './output.mjs';
import { buildGrammar, buildSecretMatcher, classifySafe } from './safe-list.mjs';
import { CWD_OUTSIDE_NOTICE, SELF_PROTECT_NOTICE, judgeShell } from './shell-judgment.mjs';
import { createNodeFsView, judgeWrite } from './write-judgment.mjs';

/** @typedef {import('./output.mjs').GateDecision} GateDecision */
/** @typedef {import('@ghost-run/ghost-runner').RunResult} RunResult */
/** @typedef {import('@ghost-run/core').WardVerdict} WardVerdict */
/** @typedef {import('@ghost-run/core').WardSet} WardSet */
/** @typedef {import('./write-judgment.mjs').FsView} FsView */
/** @typedef {'pass' | 'warn' | 'block'} Verdict */

/** @typedef {import('../store/gate-store.mjs').GateStore} GateStore */

/**
 * @typedef {object} GateInput
 * @property {string} stdin The STDIN text of the hook call.
 * @property {string} [root] Workspace root. Default: the `cwd` of the event.
 * @property {Record<string, string | undefined>} [env] Only `GHOST_RUN_WARDS_FILE` and `GHOST_RUN_SEANCE_BASE` are read.
 * @property {number | (() => number)} [elapsedSec] Seconds used so far (for the runner budget).
 *
 * @typedef {object} GateDeps
 * @property {typeof import('@ghost-run/ghost-runner').runPlan} [runPlan] Default: the real runner.
 * @property {(root: string, env: Record<string, string | undefined>) => Promise<import('../wards-file.mjs').WardsLoad>} [loadWards]
 * @property {FsView} [fsView]
 * @property {() => Date | number} clock Required: this module reads no clock of its own.
 * @property {() => string} [uuid]
 * @property {'exit2' | 'ask'} [warnMode]
 * @property {GateStore} store
 * @property {() => void} [onGrave] Called after a Grave_Entry was written. Its failure is ignored.
 */

/** Fixed deny line for a failed Run_Record or Grave_Entry write. */
export const STORE_FAILED_LINE = 'GHOST RUN GATE ERROR: store-failed; the tool call was not allowed.';

/** Fixed deny line for a command that looks like an approval command (reserved names). */
export const APPROVAL_COMMAND_LINE =
  'GHOST RUN GATE ERROR: rule approval-command: this command is reserved for humans; the tool call was not allowed.';

/** Fixed first line of the deny for an unusable Wards_File. */
export const WARDS_FILE_LINE = 'GHOST RUN GATE ERROR: wards-file; the tool call was not allowed.';

const MAX_ERROR_CODE_POINTS = 200;

/**
 * @param {string} line
 * @param {string[]} stats
 * @returns {GateDecision}
 */
function deny(line, stats) {
  return { kind: 'deny', exit: 2, stdout: '', stderr: line, stats };
}

/**
 * @param {string[]} stats
 * @returns {GateDecision}
 */
function allowSilent(stats) {
  return { kind: 'allow', exit: 0, stdout: '', stderr: '', stats };
}

/**
 * @param {unknown} id
 * @param {() => string} makeId
 * @returns {string}
 */
function pickRunId(id, makeId) {
  const v = typeof id === 'string' ? id : makeId();
  return RUN_ID_RE.test(v) ? v : makeId();
}

/**
 * Workspace-relative form of the Wards_File, or null when it is outside the workspace.
 * @param {string} root
 * @param {string} file
 * @returns {string | null}
 */
function wardsRelative(root, file) {
  const rel = path.relative(path.resolve(root), path.resolve(root, file));
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/**
 * Copy of a ward verdict with the floor notices first, so the message shows them.
 * @param {WardVerdict | undefined | null} wv
 * @param {readonly string[]} reasons
 * @returns {WardVerdict}
 */
function withFloorNotices(wv, reasons) {
  const base = wv ?? { verdict: /** @type {Verdict} */ ('pass'), violations: [], notices: [] };
  const known = new Set(base.notices.map((n) => n.reason));
  const extra = reasons
    .filter((r) => !known.has(r))
    .map((reason) => ({ kind: /** @type {const} */ ('unsupported-step'), reason, stepIndex: 0 }));
  return { ...base, notices: [...extra, ...base.notices] };
}

/**
 * A RunResult for a judgment without a ghost run (Write_Judgment, cwd outside). No claim is made.
 * @param {{ runId: string, verdict: Verdict, wardVerdict: WardVerdict | null | undefined, report?: RunResult['report'] | null, notices: string[] }} p
 * @returns {RunResult}
 */
function syntheticResult(p) {
  const zero = {
    dockerCheckMs: 0, fingerprintBeforeMs: 0, copyMs: 0, baselineMs: 0, boxOverheadMs: 0,
    execMs: 0, diffMs: 0, sqliteMs: 0, fingerprintAfterMs: 0, cleanupMs: 0,
  };
  return {
    schemaVersion: 1,
    runId: p.runId,
    status: 'ok',
    rehearsed: false,
    verdict: p.verdict,
    wardVerdict: withFloorNotices(p.wardVerdict, p.notices),
    report: p.report ?? { snapshots: [], changes: [[]], effectsOutside: [[]], observedEvents: [], variantResults: [] },
    exitCodes: [],
    copy: { cloned: false, location: '' },
    isolation: { mode: 'docker-box', p1Claimed: false, p5Claimed: false, p6Claimed: false, readOnlyMounts: [] },
    recorder: { location: 'in-box', tamperResistant: false },
    captures: [],
    diagnostics: [],
    staticFindings: [],
    notices: [...p.notices],
    phases: zero,
  };
}

/**
 * Verdict that `decisionFromRunResult` acts on, or null when it fails closed without a verdict.
 * @param {RunResult} result
 * @returns {Verdict | null}
 */
function effectiveVerdict(result) {
  const rank = { pass: 0, warn: 1, block: 2 };
  const ok = (/** @type {unknown} */ v) => v === 'pass' || v === 'warn' || v === 'block';
  if (!ok(result?.verdict) || result.status === 'internal-error') return null;
  const wv = result.wardVerdict?.verdict ?? 'pass';
  if (!ok(wv) || !result.isolation || typeof result.isolation !== 'object') return null;
  /** @type {Verdict} */
  let v = rank[result.verdict] >= rank[wv] ? result.verdict : wv;
  if (v === 'pass' && (result.status !== 'ok' || result.isolation.mode === 'static-analysis')) v = 'warn';
  return v;
}

/**
 * Persist the records of a judgment, then map it to the decision.
 * @param {{
 *   result: RunResult, command: string, ghostRun: boolean, wardSet: WardSet, sessionId: string,
 *   stats: string[], stat: (kind: import('../store/stats.mjs').StatsKind) => Promise<void>,
 *   deps: GateDeps, env: Record<string, string | undefined>, nowIso: string,
 *   noClaims?: boolean,
 * }} c
 * @returns {Promise<GateDecision>}
 */
async function conclude(c) {
  const { result, deps } = c;
  const eff = effectiveVerdict(result);
  const needsGrave = eff === 'warn' || eff === 'block';
  const persistRun = c.ghostRun || needsGrave;

  if (persistRun) {
    /** @type {Uint8Array[]} */
    let canaries = [];
    try {
      canaries = await deps.store.loadCanaries(c.wardSet);
    } catch {
      canaries = [];
    }
    const written = await deps.store.writeRun(result, canaries);
    if (!written.ok) return deny(STORE_FAILED_LINE, c.stats);
    if (needsGrave) {
      /** @type {import('@ghost-run/core').ProvenanceLog} */
      let provenance = [];
      try {
        provenance = await deps.store.readProvenance(sessionKey(c.sessionId));
      } catch {
        provenance = [];
      }
      const entry = buildGraveEntry({
        runId: result.runId,
        command: c.command,
        recordedAt: c.nowIso,
        result,
        provenance,
      });
      if (entry === null) return deny(STORE_FAILED_LINE, c.stats);
      const w = await deps.store.writeGrave(graveLine(entry, canaries));
      if (!w.ok) return deny(STORE_FAILED_LINE, c.stats);
      try {
        deps.onGrave?.();
      } catch {
        // swallowed: the seance viewer never changes the decision
      }
    }
  }

  const seanceBase = c.env['GHOST_RUN_SEANCE_BASE'];
  const decision = decisionFromRunResult(result, {
    wardCount: c.wardSet.wards.length,
    ...(needsGrave ? { graveId: `g-${result.runId}` } : {}),
    ...(typeof seanceBase === 'string' && seanceBase !== '' ? { seanceBase } : {}),
    warnMode: deps.warnMode ?? WARN_MODE,
    ...(c.noClaims === true ? { noClaims: true } : {}),
  });
  if (eff === 'pass') await c.stat('passed');
  else if (eff === 'warn') await c.stat('warned');
  else if (eff === 'block') await c.stat('blocked');
  // A decision that is neither a pass nor an ask/deny with a verdict (a fail-closed line) adds no outcome event.
  return { ...decision, stats: [...c.stats] };
}

/**
 * Decide one Pre Tool Use call. Never throws.
 * @param {GateInput} input
 * @param {GateDeps} deps
 * @returns {Promise<GateDecision>}
 */
export async function decide(input, deps) {
  try {
    return await decideInner(input, deps);
  } catch {
    return deny(`${FATAL_LINES['internal-error']}`, []);
  }
}

/**
 * @param {GateInput} input
 * @param {GateDeps} deps
 * @returns {Promise<GateDecision>}
 */
async function decideInner(input, deps) {
  const parsed = parseHookEvent(input.stdin);
  if (!parsed.ok) {
    return deny(
      `GHOST RUN GATE ERROR: invalid event (${sanitizeJudgeText(parsed.field, 40)}); the tool call was not allowed.`,
      [],
    );
  }
  const event = parsed.event;
  const root = input.root ?? event.cwd;
  const env = input.env ?? {};
  const clock = deps.clock;
  const makeId = deps.uuid ?? (() => globalThis.crypto.randomUUID());
  /** @type {string[]} */
  const stats = [];
  /** @param {import('../store/stats.mjs').StatsKind} kind */
  const stat = async (kind) => {
    stats.push(kind);
    try {
      await deps.store.appendStats(statsLine(kind, clock));
    } catch {
      // A failed Stats_Event never changes the decision.
    }
  };
  await stat('seen');

  const cls = classifyTool(event);
  if (cls.class === 'deny') return deny(cls.reason ?? NOT_RECOGNIZED_MESSAGE, stats);

  const load = await (deps.loadWards ?? loadWardsForHook)(root, env);
  if (!load.ok) {
    const errors = load.errors.slice(0, 5).map((e) => sanitizeJudgeText(String(e), MAX_ERROR_CODE_POINTS));
    return deny([WARDS_FILE_LINE, ...errors].join('\n'), stats);
  }
  const wardSet = load.wardSet;
  const wardsRel = wardsRelative(root, load.file);

  if (cls.class === 'read-only') return allowSilent(stats);

  const nowIso = utcSecond(clock);
  const base = { wardSet, sessionId: event.session_id, stats, stat, deps, env, nowIso };

  if (cls.class === 'shell') {
    const command = cls.command ?? '';
    if (isApprovalCommand(command)) return deny(APPROVAL_COMMAND_LINE, stats);

    const { grammar } = buildGrammar(load.safeCommands);
    if (classifySafe(command, grammar, buildSecretMatcher(wardSet)).safe) {
      await stat('safe-skip');
      return allowSilent(stats);
    }

    const runId = pickRunId(undefined, makeId);
    const j = await judgeShell(
      {
        root,
        toolInput: event.tool_input,
        wardSet,
        ...(input.elapsedSec === undefined ? {} : { elapsedSec: input.elapsedSec }),
        semaphore: { dir: deps.store.locksDir },
        runId,
        wardsFileRelative: wardsRel,
      },
      { ...(deps.runPlan ? { runPlan: deps.runPlan } : {}), uuid: makeId },
    );
    if (j.decision === 'busy') return deny(j.line, stats);
    if (j.decision === 'deny') {
      if (j.reason === 'runner-failed') await stat('ghosted');
      return deny(j.message, stats);
    }

    /** @type {RunResult} */
    let result;
    if (j.result) {
      await stat('ghosted');
      const notices = j.floors.map((f) => (f === 'self-protected' ? SELF_PROTECT_NOTICE : CWD_OUTSIDE_NOTICE));
      result = {
        ...j.result,
        runId: j.runId ?? runId,
        verdict: j.verdict,
        wardVerdict: withFloorNotices(j.result.wardVerdict, notices),
      };
    } else {
      result = syntheticResult({ runId, verdict: j.verdict, wardVerdict: null, notices: j.notices });
    }
    return conclude({ ...base, result, command, ghostRun: j.result !== undefined });
  }

  // Write tools: judged by their target paths, no ghost run.
  const wj = await judgeWrite(
    cls,
    { root, wardSet, toolName: event.tool_name, wardsFile: wardsRel },
    deps.fsView ?? createNodeFsView(),
  );
  const runId = pickRunId(undefined, makeId);
  const result = syntheticResult({
    runId,
    verdict: wj.verdict,
    wardVerdict: wj.wardVerdict,
    report: /** @type {RunResult['report'] | null} */ (/** @type {unknown} */ (wj.report)),
    notices: wj.notices,
  });
  const first = sanitizeJudgeText(cls.targets[0] ?? '', MAX_ERROR_CODE_POINTS);
  return conclude({ ...base, result, command: `${event.tool_name} ${first}`, ghostRun: false, noClaims: true });
}
