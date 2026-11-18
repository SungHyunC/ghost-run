// Tool `ghost_run` (Requirements 18, 19): rehearse a plan in the sealed box, store the records, and
// return the verdict. Advisory: only the Ghost_Gate enforces. The same builders and the same
// decisionFromRunResult message path as the gate are used.
import path from 'node:path';
import { runPlan as realRunPlan } from '@ghost-run/ghost-runner';
import {
  buildGraveEntry,
  decisionFromRunResult,
  diffSummary,
  enforceCaps,
  loadCanaries,
  loadWardsForHook,
  redactCanaries,
  storePaths,
  appendLine,
  writeRunRecord,
} from '@ghost-run/kiro-hook';
import { confinePath } from '../confine.mjs';
import { defineTool } from '../tool-kit.mjs';
import { errorResult, makeResult } from '../result.mjs';

/** Pipeline deadline of the runner in the MCP process (there is no 60 s hook limit). */
export const MCP_PIPELINE_DEADLINE_SEC = 55;

export const GHOST_RUN_DESCRIPTION =
  'Rehearse a plan (1 to 50 shell actions) in a sealed copy of the workspace and return a verdict (pass, warn, block), ' +
  'the isolation claims, the exit codes, and a diff summary. Advisory: the result helps an agent that chooses to call it. ' +
  'Calling ghost_run does not make a command safe, and a pass is not an approval; only the Ghost_Gate enforces a verdict on a tool call. ' +
  'Starts a Docker container and writes the Ghost_Store.';

const RANK = { pass: 0, warn: 1, block: 2 };

/** One rehearsal at a time per process; the box is a shared resource. */
let tail = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function serialize(fn) {
  const run = tail.then(fn, fn);
  tail = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Verdict that decisionFromRunResult acts on (same rule as the gate), or null when it fails closed.
 * @param {any} result
 * @returns {'pass' | 'warn' | 'block' | null}
 */
export function effectiveVerdict(result) {
  const ok = (/** @type {unknown} */ v) => v === 'pass' || v === 'warn' || v === 'block';
  if (!result || !ok(result.verdict) || result.status === 'internal-error') return null;
  const wv = result.wardVerdict?.verdict ?? 'pass';
  if (!ok(wv) || !result.isolation || typeof result.isolation !== 'object') return null;
  /** @type {'pass' | 'warn' | 'block'} */
  let v = RANK[/** @type {'pass'} */ (result.verdict)] >= RANK[/** @type {'pass'} */ (wv)] ? result.verdict : wv;
  if (v === 'pass' && (result.status !== 'ok' || result.isolation.mode === 'static-analysis')) v = 'warn';
  return v;
}

/** @param {unknown} clock */
function utcSecond(clock) {
  const raw = typeof clock === 'function' ? clock() : new Date();
  const d = raw instanceof Date ? raw : new Date(/** @type {number} */ (raw));
  return `${d.toISOString().slice(0, 19)}Z`;
}

/**
 * Copy-relative cwd of every action, or an error text. A cwd must be an existing folder inside the workspace.
 * @param {string} root
 * @param {{ command: string, cwd?: string }[]} plan
 * @returns {Promise<{ ok: true, plan: { command: string, cwd?: string }[] } | { ok: false, error: string }>}
 */
async function confinePlan(root, plan) {
  const out = [];
  const rootInfo = await confinePath(root, '.');
  for (const [i, action] of plan.entries()) {
    if (action.cwd === undefined || action.cwd === '') {
      out.push({ command: action.command });
      continue;
    }
    if (!rootInfo.ok) return { ok: false, error: `action ${i}: workspace root is not readable; nothing was rehearsed` };
    const c = await confinePath(root, action.cwd);
    if (!c.ok) return { ok: false, error: `action ${i}: cwd ${c.error}; nothing was rehearsed` };
    const rel = path.relative(rootInfo.real, c.real);
    out.push(rel === '' ? { command: action.command } : { command: action.command, cwd: rel.split(path.sep).join('/') });
  }
  return { ok: true, plan: out };
}

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server @param {import('../tool-kit.mjs').ToolContext} ctx */
export function register(server, ctx) {
  defineTool(server, ctx, 'ghost_run', GHOST_RUN_DESCRIPTION, (args) => serialize(() => handle(args, ctx)));
}

/**
 * @param {{ plan: { command: string, cwd?: string }[] }} args
 * @param {import('../tool-kit.mjs').ToolContext} ctx
 */
async function handle(args, ctx) {
  const root = ctx.root;
  const load = await (ctx.deps.loadWards ?? loadWardsForHook)(root, ctx.env);
  if (!load.ok) return errorResult(['Wards file error:', ...load.errors.slice(0, 5)].join('\n'));
  const wardSet = load.wardSet;

  const confined = await confinePlan(root, args.plan);
  if (!confined.ok) return errorResult(confined.error);

  const runPlan = ctx.deps.runPlan ?? realRunPlan;
  /** @type {any} */
  let output;
  /** @type {any} */
  let result;
  try {
    output = await runPlan(confined.plan, { original: root, wardSet, pipelineDeadlineSec: MCP_PIPELINE_DEADLINE_SEC });
    result = output.result;
  } catch {
    return errorResult('ghost_run failed: the runner reported an error; nothing was approved');
  } finally {
    // Payload bytes are never read; drop them before anything is returned or stored.
    const payloads = output?.payloads;
    if (payloads && typeof payloads.clear === 'function') payloads.clear();
    output = undefined;
  }

  const eff = effectiveVerdict(result);
  if (eff === null) return errorResult('ghost_run failed: the runner result was not usable; nothing was approved');
  const needsGrave = eff === 'warn' || eff === 'block';
  const planB = result.isolation.mode === 'static-analysis';

  /** @type {Uint8Array[]} */
  let canaries = [];
  try {
    canaries = await loadCanaries(root, wardSet);
  } catch {
    canaries = [];
  }
  const written = await writeRunRecord(root, result, canaries);
  if (!written.ok) return errorResult('ghost_run failed: store-failed (the Run_Record could not be written)');

  /** @type {string | undefined} */
  let graveId;
  if (needsGrave) {
    const command = args.plan.map((a) => a.command).join(' ; ');
    const entry = buildGraveEntry({ runId: result.runId, command, recordedAt: utcSecond(ctx.deps.clock), result, provenance: [] });
    if (entry === null) return errorResult('ghost_run failed: store-failed (the Grave_Entry could not be built)');
    const w = await appendLine(storePaths(root).graveyard, redactCanaries(JSON.stringify(entry), canaries));
    if (!w.ok) return errorResult('ghost_run failed: store-failed (the Grave_Entry could not be written)');
    graveId = entry.id;
  }
  try {
    await enforceCaps(root);
  } catch {
    // A cap failure never changes the result.
  }

  const seanceBase = ctx.env['GHOST_RUN_SEANCE_BASE'];
  const decision = decisionFromRunResult(result, {
    wardCount: wardSet.wards.length,
    ...(graveId ? { graveId } : {}),
    ...(typeof seanceBase === 'string' && seanceBase !== '' ? { seanceBase } : {}),
    warnMode: 'exit2',
  });
  const message = decision.stdout !== '' ? decision.stdout : decision.stderr;
  const iso = result.isolation;
  const claim = (/** @type {unknown} */ v) => !planB && v === true;
  return makeResult(
    {
      runId: result.runId,
      ...(graveId ? { graveId } : {}),
      verdict: eff,
      rehearsed: planB ? false : result.rehearsed === true,
      isolation: { mode: iso.mode, p1Claimed: claim(iso.p1Claimed), p5Claimed: claim(iso.p5Claimed), p6Claimed: claim(iso.p6Claimed) },
      exitCodes: Array.isArray(result.exitCodes) ? result.exitCodes : [],
      message,
      diffSummary: diffSummary(result.report?.changes ?? []),
      truncated: false,
    },
    { text: message },
  );
}
