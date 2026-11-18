// contract-pbt runner: plans the vitest suites of a selection, spawns them with
// process.execPath (no shell), reads the reporter lines, enforces the 55 s
// deadline, keeps the one-run lock, and builds the PbtSummary. The hook defines
// no run count: each owning test configuration reads GHOST_PBT_MODE itself
// (core and worlds: `short`; the ghost-runner configuration: `save`).
// Never starts the nightly mode.
import { execFile, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storePaths, storeWriteFile } from '../store/ghost-store.mjs';
import { LINE_KEY } from './reporter.mjs';

/** Internal deadline (the host limit is 60 s). */
export const DEADLINE_MS = 55_000;
/** Wait between SIGTERM and SIGKILL. */
export const KILL_GRACE_MS = 2_000;

/** Core files of the judgment engine (P1 to P6, ward kinds, engine determinism), as vitest file filters. */
export const JUDGMENT_ENGINE_FILTERS = Object.freeze([
  'tests/p1-isolation',
  'tests/p2-fidelity',
  'tests/p3-restore',
  'tests/p4-monotonicity',
  'tests/p4-refined-monotonicity',
  'tests/p5-protection',
  'tests/p6-content',
  'tests/p6-egress',
  'tests/path-ward',
  'tests/sql-ward',
  'tests/wards',
  'tests/engine-determinism',
]);

/**
 * @typedef {{ id: string, criterion: string, seed: number | null, counterexample: string }} FailedProperty
 * @typedef {{
 *   ok: boolean,
 *   outcome: 'passed' | 'failed' | 'incomplete',
 *   reason?: 'deadline' | 'no-suites' | 'no-tests',
 *   failed: FailedProperty[],
 *   skipped: string[],
 *   unfinished: string[],
 *   passed: number,
 *   suites: string[],
 *   elapsedMs: number,
 *   note?: string,
 * }} PbtSummary
 * @typedef {{ label: string, cwd: string, args: string[], mode: 'short' | 'save' }} Suite
 */

/** The real spawn (the only child_process use of the hook family besides the probe). */
export const realSpawn = spawn;

const WORLD_FILE = 'tests/contract.test.ts';
const WORLDS_CONFIG = 'vitest.worlds.config.ts';

/**
 * The reporter module path and the vitest entry of this repository.
 * @returns {{ vitestBin: string, reporter: string }}
 */
export function defaultPaths() {
  const req = createRequire(import.meta.url);
  const vitestBin = path.join(path.dirname(req.resolve('vitest/package.json')), 'vitest.mjs');
  return { vitestBin, reporter: fileURLToPath(new URL('./reporter.mjs', import.meta.url)) };
}

/**
 * Vitest arguments of one suite (after the vitest entry). A suite inside
 * `ghost-runner` runs only its unit project (the Docker project is never
 * started on save) and uses the on-save mode of that configuration.
 * @param {{ cwd: string, rest: string[] }} s
 * @param {string} root
 * @param {string} reporter
 * @returns {{ args: string[], mode: 'short' | 'save' }}
 */
export function vitestArgs(s, root, reporter) {
  const isRunner = path.relative(root, s.cwd).split(path.sep)[0] === 'ghost-runner';
  const args = ['run', '--reporter', reporter, '--typecheck.enabled=false'];
  if (isRunner) args.push('--project', 'unit');
  args.push(...s.rest);
  return { args, mode: isRunner ? 'save' : 'short' };
}

/**
 * Names of the world folders that have `world.config.ts`.
 * @param {string} root
 * @param {{ readdirSync: typeof readdirSync, existsSync: typeof existsSync }} fs
 * @returns {string[]}
 */
function registeredWorlds(root, fs) {
  try {
    return fs
      .readdirSync(path.join(root, 'worlds'))
      .filter((n) => fs.existsSync(path.join(root, 'worlds', n, 'world.config.ts')))
      .sort();
  } catch {
    return [];
  }
}

/**
 * The suites for one world. A contract test is run through the world's own
 * vitest configuration when the world has a package.json, else through the
 * root `vitest.worlds.config.ts`. A world without a contract test runs its
 * own test folder (its configuration reads its own run counts, for example
 * `tests/pbt-budget.json`).
 * @param {string} root
 * @param {string} world
 * @param {string} reporter
 * @param {{ existsSync: typeof existsSync }} fs
 * @returns {Suite[]}
 */
function worldSuites(root, world, reporter, fs) {
  const dir = path.join(root, 'worlds', world);
  const hasPackage = fs.existsSync(path.join(dir, 'package.json'));
  const hasContract = fs.existsSync(path.join(dir, WORLD_FILE));
  const label = `world:${world}`;
  if (hasContract && !hasPackage) {
    if (!fs.existsSync(path.join(root, WORLDS_CONFIG))) return [];
    const { args, mode } = vitestArgs(
      { cwd: root, rest: ['--config', WORLDS_CONFIG, `worlds/${world}/${WORLD_FILE}`] },
      root,
      reporter,
    );
    return [{ label, cwd: root, args, mode }];
  }
  if (!hasPackage) return [];
  const { args, mode } = vitestArgs({ cwd: dir, rest: hasContract ? [WORLD_FILE] : [] }, root, reporter);
  return [{ label, cwd: dir, args, mode }];
}

/**
 * The ordered suites of a selection.
 * @param {import('./select.mjs').SuiteSelection} sel
 * @param {{ root: string, reporter: string, fs?: { readdirSync: typeof readdirSync, existsSync: typeof existsSync } }} ctx
 * @returns {Suite[]}
 */
export function planSuites(sel, ctx) {
  const fs = ctx.fs ?? { readdirSync, existsSync };
  const { root, reporter } = ctx;
  /** @type {Suite[]} */
  const out = [];
  if (sel.kind === 'core') {
    const cwd = path.join(root, 'core');
    const { args, mode } = vitestArgs({ cwd, rest: [] }, root, reporter);
    out.push({ label: 'core', cwd, args, mode });
    for (const world of registeredWorlds(root, fs)) out.push(...worldSuites(root, world, reporter, fs));
  } else if (sel.kind === 'world') {
    out.push(...worldSuites(root, sel.world, reporter, fs));
    const cwd = path.join(root, 'core');
    const { args, mode } = vitestArgs({ cwd, rest: [...JUDGMENT_ENGINE_FILTERS] }, root, reporter);
    out.push({ label: 'core:judgment-engine', cwd, args, mode });
  }
  return out;
}

/**
 * Parse one reporter line. Returns null for any other output.
 * @param {string} line
 * @returns {Record<string, any> | null}
 */
export function parseReporterLine(line) {
  if (!line.startsWith(`{"${LINE_KEY}":`)) return null;
  try {
    const v = JSON.parse(line);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

const COUNTEREXAMPLE_MAX = 1000;

/**
 * Describe a failed test in the form of the core-contract VerificationError:
 * property id, shrunk counterexample, violated criterion id, seed.
 * @param {{ name: string, file: string, message: string }} t
 * @returns {FailedProperty}
 */
export function describeFailure(t) {
  const msg = t.message ?? '';
  const idMsg = /propertyId["']?\s*[:=]\s*["']?((?:KI-|UI-|GS-)?P\d{1,2})\b/.exec(msg);
  const idName = /\b((?:KI-|UI-|GS-)?P\d{1,2})\b/.exec(t.name);
  const base = path.posix.basename((t.file ?? '').replaceAll('\\', '/'));
  const idFile = /^(?:prop-|p)(\d{1,2})[-.]/.exec(base);
  const id = idMsg?.[1] ?? idName?.[1] ?? (idFile ? `P${Number(idFile[1])}` : t.name.slice(0, 80));
  const crit =
    /criterionId["']?\s*[:=]\s*["']?([A-Za-z0-9_.-]+)/.exec(msg)?.[1] ??
    /Requirements?\s+(\d+(?:\.\d+)?)/.exec(`${t.name}\n${msg}`)?.[1] ??
    'unknown';
  const seedText = /seed:\s*(-?\d+)/.exec(msg)?.[1];
  const ce = /Counterexample:\s*([^\n]+)/.exec(msg)?.[1] ?? /counterexample["']?\s*[:=]\s*([^\n]+)/.exec(msg)?.[1];
  const counterexample = (ce ?? msg.split('\n')[0] ?? '').slice(0, COUNTEREXAMPLE_MAX) || 'n/a';
  return { id, criterion: crit, seed: seedText === undefined ? null : Number(seedText), counterexample };
}

const DOCKER_SKIP_SUFFIX = '[skipped (docker unavailable)]';

/** @param {string} name @param {string} file */
export function isDockerSkip(name, file) {
  return name.includes(DOCKER_SKIP_SUFFIX) || /\.docker\.test\./.test(file);
}

/**
 * Default process inspection: owner uid and command line of a pid, or null.
 * @param {number} pid
 * @returns {Promise<{ uid: number, command: string } | null>}
 */
export function inspectProcess(pid) {
  return new Promise((resolve) => {
    execFile('ps', ['-o', 'uid=,command=', '-p', String(pid)], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(null);
      const m = /^\s*(\d+)\s+(.*)$/s.exec(String(stdout).trim());
      resolve(m ? { uid: Number(m[1]), command: String(m[2]) } : null);
    });
  });
}

/** @param {number} ms */
const realSleep = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

/**
 * @typedef {{
 *   root: string,
 *   spawn: (cmd: string, args: string[], opts: Record<string, unknown>) => any,
 *   kill?: (pid: number, signal: string) => void,
 *   inspect?: (pid: number) => Promise<{ uid: number, command: string } | null>,
 *   uid?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   vitestBin?: string,
 *   reporter?: string,
 *   env?: Record<string, string | undefined>,
 *   now?: () => number,
 *   deadlineMs?: number,
 *   fs?: { readdirSync: typeof readdirSync, existsSync: typeof existsSync },
 *   registerCleanup?: (fn: () => void) => void,
 * }} RunDeps
 */

/**
 * Kill a process group: SIGTERM, then SIGKILL after KILL_GRACE_MS.
 * @param {number} pid
 * @param {RunDeps} deps
 * @param {() => boolean | Promise<boolean>} isGone
 */
async function stopGroup(pid, deps, isGone) {
  const kill = deps.kill ?? ((p, s) => process.kill(p, /** @type {NodeJS.Signals} */ (s)));
  const sleep = deps.sleep ?? realSleep;
  try {
    kill(-pid, 'SIGTERM');
  } catch {
    // already gone
  }
  await sleep(KILL_GRACE_MS);
  if (await isGone()) return;
  try {
    kill(-pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

/**
 * Lock helpers. `locks/pbt.lock` holds the PID of the running child.
 * @param {string} root
 */
export function lockFile(root) {
  return path.join(storePaths(root).locks, 'pbt.lock');
}

/** @param {string} file @returns {Promise<number | null>} */
async function readLockPid(file) {
  try {
    const n = Number.parseInt((await fsp.readFile(file, 'utf8')).trim(), 10);
    return Number.isInteger(n) && n > 1 ? n : null;
  } catch {
    return null;
  }
}

/** @param {string} file @param {number} pid */
async function writeLockPid(file, pid) {
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fsp.writeFile(file, `${pid}\n`, { mode: 0o600 });
}

/**
 * Stop an older run when the lock owner is a process of this user whose
 * command line is a vitest run. A foreign or stale PID is left alone.
 * @param {string} file
 * @param {RunDeps} deps
 * @returns {Promise<'none' | 'stopped' | 'foreign'>}
 */
async function stopOlderRun(file, deps) {
  const pid = await readLockPid(file);
  if (pid === null) return 'none';
  const inspect = deps.inspect ?? inspectProcess;
  const info = await inspect(pid);
  if (info === null) return 'none';
  const uid = deps.uid ?? process.getuid?.() ?? -1;
  if (info.uid !== uid || !/vitest/.test(info.command)) return 'foreign';
  await stopGroup(pid, deps, async () => (await inspect(pid)) === null);
  return 'stopped';
}

/**
 * Run the suites of a selection and return the summary. The summary is
 * written to `.ghost-run/pbt/last.json` unless a newer save took the lock.
 * @param {import('./select.mjs').SuiteSelection} sel
 * @param {RunDeps} deps
 * @returns {Promise<{ summary: PbtSummary, superseded: boolean }>}
 */
export async function runSuites(sel, deps) {
  const now = deps.now ?? (() => performance.now());
  const started = now();
  const defaults = defaultPaths();
  const reporter = deps.reporter ?? defaults.reporter;
  const vitestBin = deps.vitestBin ?? defaults.vitestBin;
  const suites = planSuites(sel, { root: deps.root, reporter, fs: deps.fs });
  const file = lockFile(deps.root);
  const deadlineMs = deps.deadlineMs ?? DEADLINE_MS;

  /** @type {FailedProperty[]} */
  const failed = [];
  /** @type {string[]} */
  const skipped = [];
  const finished = new Set();
  const collected = new Set();
  /** @type {Set<string>} */
  const filesSeen = new Set();
  /** @type {Set<string>} */
  const filesCollected = new Set();
  let passed = 0;
  let deadlineHit = false;
  let superseded = false;
  let runError = false;
  /** @type {(() => void) | null} */
  let killActive = null;
  deps.registerCleanup?.(() => killActive?.());

  /** @param {Record<string, any>} ev */
  const onEvent = (ev) => {
    if (ev['e'] === 'files' && Array.isArray(ev['files'])) {
      for (const f of ev['files']) filesSeen.add(String(f));
    } else if (ev['e'] === 'collected') {
      filesCollected.add(String(ev['file'] ?? ''));
      if (Array.isArray(ev['names'])) for (const n of ev['names']) collected.add(String(n));
    } else if (ev['e'] === 'test') {
      const name = String(ev['name'] ?? '');
      const fileName = String(ev['file'] ?? '');
      finished.add(name);
      if (ev['state'] === 'passed') passed += 1;
      else if (ev['state'] === 'skipped') {
        skipped.push(
          isDockerSkip(name, fileName) ? `${name} [skipped (docker unavailable)]` : `${name} [skipped]`,
        );
      } else failed.push(describeFailure({ name, file: fileName, message: String(ev['message'] ?? '') }));
    }
  };

  const takeover = await stopOlderRun(file, deps).catch(() => 'none');
  void takeover;

  /** @type {number | null} */
  let lastPid = null;
  const deadlineAt = started + deadlineMs;

  for (const suite of suites) {
    if (deadlineHit || superseded) break;
    if (lastPid !== null) {
      const holder = await readLockPid(file);
      if (holder !== lastPid && holder !== null) {
        superseded = true;
        break;
      }
    }
    const remaining = deadlineAt - now();
    if (remaining <= 0) {
      deadlineHit = true;
      break;
    }
    const env = { ...(deps.env ?? process.env), GHOST_PBT_MODE: suite.mode };
    const child = deps.spawn(process.execPath, [vitestBin, ...suite.args], {
      cwd: suite.cwd,
      env,
      detached: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pid = typeof child.pid === 'number' ? child.pid : null;
    // Listeners and the deadline timer come first: a fast child must not close before they exist.
    let exited = false;
    /** @type {number | null} */
    let exitCode = null;
    let buffer = '';
    child.stdout?.on('data', (/** @type {Buffer | string} */ chunk) => {
      buffer += chunk.toString();
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const ev = parseReporterLine(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
        if (ev) onEvent(ev);
      }
    });
    killActive = () => {
      if (pid !== null) void stopGroup(pid, deps, () => exited);
    };
    const done = new Promise((resolve) => {
      child.once('close', (/** @type {number | null} */ code) => {
        exited = true;
        exitCode = code;
        resolve(undefined);
      });
      child.once('error', () => {
        exited = true;
        runError = true;
        resolve(undefined);
      });
    });
    /** @type {ReturnType<typeof globalThis.setTimeout> | undefined} */
    let timer;
    const timeout = new Promise((resolve) => {
      timer = globalThis.setTimeout(() => {
        deadlineHit = true;
        if (pid !== null) void stopGroup(pid, deps, () => exited);
        // Do not wait for a child that ignores both signals.
        globalThis.setTimeout(() => resolve(undefined), KILL_GRACE_MS + 500);
      }, remaining);
    });
    if (pid !== null) {
      lastPid = pid;
      await writeLockPid(file, pid).catch(() => undefined);
    }
    await Promise.race([done, timeout]);
    globalThis.clearTimeout(timer);
    killActive = null;
    if (buffer !== '') {
      const ev = parseReporterLine(buffer);
      if (ev) onEvent(ev);
    }
    if (!deadlineHit && exitCode !== 0 && failed.length === 0 && !superseded) {
      // The child ended non-zero without a failed test: a configuration or import error, or a signal.
      const holder = await readLockPid(file);
      if (holder !== null && holder !== pid) superseded = true;
      else runError = true;
    }
    if (superseded || runError) break;
  }

  // The lock is released only by the run that still holds it.
  const holder = await readLockPid(file);
  if (lastPid !== null && holder !== null && holder !== lastPid) superseded = true;
  if (!superseded && holder === lastPid) await fsp.rm(file, { force: true }).catch(() => undefined);

  const unfinished = [
    ...[...collected].filter((n) => !finished.has(n)),
    ...[...filesSeen].filter((f) => !filesCollected.has(f)).map((f) => `file: ${f}`),
  ];
  if (runError && failed.length === 0) {
    failed.push({ id: 'run-error', criterion: 'unknown', seed: null, counterexample: 'the test process ended without a result' });
  }
  const elapsedMs = Math.round(now() - started);
  /** @type {PbtSummary} */
  const summary = {
    ok: false,
    outcome: 'incomplete',
    failed,
    skipped,
    unfinished,
    passed,
    suites: suites.map((s) => s.label),
    elapsedMs,
  };
  if (failed.length > 0) {
    summary.outcome = 'failed';
  } else if (deadlineHit) {
    summary.reason = 'deadline';
    if (unfinished.length === 0) unfinished.push('(the remaining suites did not start)');
  } else if (suites.length === 0) {
    summary.reason = 'no-suites';
    summary.note = 'no contract test or world test folder found for this path';
  } else if (passed + skipped.length === 0) {
    summary.reason = 'no-tests';
    summary.note = 'the suites ran no test';
  } else if (unfinished.length > 0) {
    summary.note = 'some tests did not finish';
  } else {
    summary.outcome = 'passed';
    summary.ok = true;
  }
  if (!superseded) await writeLast(deps.root, summary);
  return { summary, superseded };
}

/**
 * Write `.ghost-run/pbt/last.json` (atomic replace). Never throws.
 * @param {string} root
 * @param {PbtSummary} summary
 */
export async function writeLast(root, summary) {
  const file = path.join(storePaths(root).pbt, 'last.json');
  return storeWriteFile(file, `${JSON.stringify(summary, null, 2)}\n`, []);
}
