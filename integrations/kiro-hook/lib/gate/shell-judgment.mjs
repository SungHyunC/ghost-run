// Shell judgment (Requirement 5, design D9). Builds a one-action Tool_Call_Plan, rehearses it with the
// ghost runner, and returns the runner's verdict as is, raised only by the self-protection floor.
// The command text goes to the runner as a value. It is never put on a host shell line and never
// passed to a pattern check. No file is written here and no LLM is called.
import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { RUN_ID_RE, runPlan as realRunPlan } from '@ghost-run/ghost-runner';
import { COMMAND_MAX_CODE_POINTS, DOCKER_WAKE_RETRY_MS } from '../../gate-config.mjs';
import { createSelfProtect } from './self-protect.mjs';
import { withSlot } from './semaphore.mjs';
import { runnerBudgetSec } from './watchdog.mjs';

/** Notice for a cwd outside the workspace (no ghost starts). */
export const CWD_OUTSIDE_NOTICE = 'step 0: cwd outside the workspace, not rehearsed.';

/** Notice for a change under a Self_Protected_Path. */
export const SELF_PROTECT_NOTICE = 'step 0: change to a gate-protected path needs human approval.';

/** Fixed deny line for a rejected runner. */
export const RUNNER_FAILED_LINE = 'GHOST RUN GATE ERROR: runner-failed; the tool call was not allowed.';

/** Fixed deny line for a command outside the length bound. */
export const COMMAND_BOUNDS_LINE = `GHOST RUN GATE ERROR: command must have 1 to ${COMMAND_MAX_CODE_POINTS} code points; the tool call was not allowed.`;

/** Thrown by `buildToolCallPlan` for a command of 0 or more than the bound in code points. */
export class CommandBoundsError extends Error {
  /** @param {number} length */
  constructor(length) {
    super(`command length ${length} is outside 1..${COMMAND_MAX_CODE_POINTS} code points`);
    this.name = 'CommandBoundsError';
    this.length = length;
  }
}

/**
 * Number of code points, stopping once the bound is exceeded.
 * @param {string} text
 * @returns {number}
 */
function codePointLength(text) {
  let n = 0;
  for (const _ of text) {
    n += 1;
    if (n > COMMAND_MAX_CODE_POINTS) break;
  }
  return n;
}

/**
 * One-action plan. The command is carried as a value.
 * @param {unknown} command
 * @param {string} [cwdRel] Copy-relative cwd with "/" separators; omitted for the Copy root.
 * @returns {{ command: string, cwd?: string }[]}
 */
export function buildToolCallPlan(command, cwdRel) {
  if (typeof command !== 'string') throw new CommandBoundsError(0);
  const n = codePointLength(command);
  if (n < 1 || n > COMMAND_MAX_CODE_POINTS) throw new CommandBoundsError(n);
  return [cwdRel ? { command, cwd: cwdRel } : { command }];
}

/**
 * Real path of `p`, or of its nearest existing parent joined with the missing tail.
 * @param {string} p absolute
 * @returns {Promise<string>}
 */
async function realpathNearest(p) {
  let current = p;
  /** @type {string[]} */
  const tail = [];
  for (;;) {
    try {
      const real = await fsp.realpath(current);
      return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return p;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * @param {string} root absolute workspace root
 * @param {string | undefined} cwd tool_input.cwd (or the event cwd)
 * @returns {Promise<{ inside: true, cwdRel: string | undefined } | { inside: false }>}
 */
async function resolveCwd(root, cwd) {
  const realRoot = await realpathNearest(path.resolve(root));
  if (typeof cwd !== 'string' || cwd === '') return { inside: true, cwdRel: undefined };
  const real = await realpathNearest(path.resolve(realRoot, cwd));
  const rel = path.relative(realRoot, real);
  if (rel === '') return { inside: true, cwdRel: undefined };
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return { inside: false };
  return { inside: true, cwdRel: rel.split(path.sep).join('/') };
}

/**
 * Whether a trusted call stays inside the workspace: the effective cwd, and the `cd` target when given.
 * Real paths are compared, so a symbolic link out of the workspace does not count as inside. A target may be
 * relative (to the cwd), the workspace root as given, its real path, or a path below either (Original-root rule).
 * @param {string} root absolute workspace root
 * @param {unknown} cwd tool_input.cwd
 * @param {string | undefined} dir target of a leading `cd`
 * @returns {Promise<boolean>}
 */
export async function trustedDirInside(root, cwd, dir) {
  const realRoot = await realpathNearest(path.resolve(root));
  const within = (/** @type {string} */ p) => {
    const rel = path.relative(realRoot, p);
    return !(rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel));
  };
  const base = await realpathNearest(path.resolve(realRoot, typeof cwd === 'string' ? cwd : ''));
  if (!within(base)) return false;
  if (dir === undefined) return true;
  return within(await realpathNearest(path.resolve(base, dir)));
}

/** @param {'pass' | 'warn' | 'block'} v */
const atLeastWarn = (v) => (v === 'pass' ? 'warn' : v);

/**
 * @typedef {object} ShellContext
 * @property {string} root Absolute workspace root.
 * @property {{ command?: unknown, cwd?: unknown }} toolInput The tool_input of the call. `timeout` and `run_in_background` are ignored.
 * @property {import('@ghost-run/core').WardSet} wardSet
 * @property {number | (() => number)} [elapsedSec] Seconds used so far; a function is read after the slot is held.
 * @property {import('./semaphore.mjs').SemaphoreOptions} semaphore Slot options (`dir` required).
 * @property {string} [runId] Caller-chosen run id (so the watchdog can be armed first); must match the runner pattern.
 * @property {string | null} [wardsFileRelative] Resolved Wards_File, workspace-relative, for the self-protection floor.
 *
 * @typedef {object} ShellDeps
 * @property {typeof realRunPlan} [runPlan]
 * @property {() => string} [uuid]
 *
 * @typedef {{ decision: 'deny', reason: 'command-bounds' | 'runner-failed', message: string, runId?: string }
 *   | { decision: 'busy', line: string }
 *   | { decision: 'judged', verdict: 'pass' | 'warn' | 'block', rehearsed: boolean, runId?: string,
 *       result?: import('@ghost-run/ghost-runner').RunResult, notices: string[], floors: string[] }} ShellJudgment
 */

/**
 * Rehearse one shell call. The returned `runId` lets the caller arm the watchdog before the call
 * (use `deps.uuid` or `ctx` to fix it earlier) and is also set on a runner failure.
 * @param {ShellContext} ctx
 * @param {ShellDeps} [deps]
 * @returns {Promise<ShellJudgment>}
 */
export async function judgeShell(ctx, deps = {}) {
  const runPlan = deps.runPlan ?? realRunPlan;
  const makeId = deps.uuid ?? randomUUID;

  const cwd = await resolveCwd(ctx.root, typeof ctx.toolInput?.cwd === 'string' ? ctx.toolInput.cwd : undefined);

  /** @type {{ command: string, cwd?: string }[]} */
  let plan;
  try {
    plan = buildToolCallPlan(ctx.toolInput?.command, cwd.inside ? cwd.cwdRel : undefined);
  } catch (err) {
    if (err instanceof CommandBoundsError) {
      return { decision: 'deny', reason: 'command-bounds', message: COMMAND_BOUNDS_LINE };
    }
    throw err;
  }

  if (!cwd.inside) {
    return { decision: 'judged', verdict: 'warn', rehearsed: false, notices: [CWD_OUTSIDE_NOTICE], floors: ['cwd-outside'] };
  }

  let runId = ctx.runId ?? makeId();
  if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) runId = randomUUID();

  const slot = await withSlot(ctx.semaphore, async () => {
    const elapsed = typeof ctx.elapsedSec === 'function' ? ctx.elapsedSec() : (ctx.elapsedSec ?? 0);
    /** @type {import('@ghost-run/ghost-runner').RunOutput | undefined} */
    let output;
    try {
      output = await runPlan(plan, {
        original: ctx.root,
        wardSet: ctx.wardSet,
        pipelineDeadlineSec: runnerBudgetSec(elapsed),
        runId,
        dockerWakeRetryMs: DOCKER_WAKE_RETRY_MS,
      });
      return { ok: /** @type {const} */ (true), result: output.result };
    } catch {
      return { ok: /** @type {const} */ (false) };
    } finally {
      // The payload bytes are never read; drop them before anything is printed or stored.
      const payloads = /** @type {{ clear?: () => void } | undefined} */ (output?.payloads);
      if (payloads && typeof payloads.clear === 'function') payloads.clear();
      output = undefined;
    }
  });

  if (slot.busy) return { decision: 'busy', line: slot.line };
  if (!slot.value.ok) return { decision: 'deny', reason: 'runner-failed', message: RUNNER_FAILED_LINE, runId };

  const { result } = slot.value;
  const notices = [...(result.notices ?? [])];
  /** @type {string[]} */
  const floors = [];
  let verdict = result.verdict;

  const protect = createSelfProtect(ctx.wardsFileRelative);
  const changes = (result.report?.changes ?? []).flat();
  if (protect.selfProtectedChanges(changes).length > 0) {
    verdict = atLeastWarn(verdict);
    notices.push(SELF_PROTECT_NOTICE);
    floors.push('self-protected');
  }
  return { decision: 'judged', verdict, rehearsed: result.rehearsed, runId, result, notices, floors };
}
