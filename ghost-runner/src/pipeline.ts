/**
 * `runPlan`: the pipeline that rehearses a Plan against a Copy of Original inside a sealed box
 * and returns a RunResult plus the in-memory payloads (Req 3, 7, 13, 14, 15, 16).
 *
 * Phases (docker-box mode): option validation, availability check (Plan B on failure),
 * Original fingerprint overlapped with box create, copier, secretValues seam (task 12.8),
 * baseline, step loop through `stepInSession`, recorder collect, fingerprint after, ward
 * evaluation, verdict and claims, cleanup in `finally`.
 *
 * Deadlines: Docker check 2.0 s, copy 20 s, execution limit with `docker kill` (in the box),
 * pipeline deadline (default and maximum 55 s). Every external call timeout derives from the time left.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath, rm, stat, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { WardEngine } from '@ghost-run/core';
import type {
  Change,
  Effect,
  GhostReport,
  ObservedEvent,
  Snapshot,
  Verdict,
  WardSet,
  WardVerdict,
} from '@ghost-run/core';
import {
  COPY_LIMIT_SEC,
  MAX_SECRET_FILES,
  MAX_SECRET_FILE_BYTES,
  imageFromEnv,
  resolveRunnerOptions,
  validatePlanSize,
  type ResolvedRunnerOptions,
  type RunnerOptions,
} from './config.js';
import { copyOriginal, placeCopy, sentinelPathFor } from './copy/copier.js';
import { checkDockerAvailability, type DockerAvailability } from './docker/availability.js';
import { createBox, findRunIdContainers, removeRunContainers, type Box } from './docker/box.js';
import { sweepStaleBoxesOnce } from './docker/stale-sweep.js';
import { createDockerClient, type DeadlineClock, type DockerClient } from './docker/cli.js';
import { ConfigError, FingerprintReadError } from './errors.js';
import { diff as diffStates, diffDiagnostics } from './fs/differ.js';
import { fingerprintOriginal, type OriginalFingerprint } from './fs/fingerprint.js';
import { compareBytes, walkManifest, type ManifestEntry } from './fs/manifest.js';
import { createSecretMatcher } from './recorder/secret-patterns.js';
import { nextSqliteState, type SqliteState } from './fs/sqlite.js';
import { EventBuilder } from './recorder/events.js';
import type {
  CaptureSummary,
  Diagnostic,
  Isolation,
  PhaseDurations,
  RunOutput,
  RunResult,
  RunStatus,
} from './result.js';
import { SECRET_VALUES_CAPPED } from './result.js';
import { analyze } from './static/analyzer.js';
import {
  classifyOriginalChange,
  detectProtectedPathExcluded,
  p1Claimed,
  p5Claimed,
  p6Claimed,
  protectedPathExcludedDiagnostics,
  runnerVerdict,
  type OriginalClassification,
} from './verdict.js';
import {
  effectiveSecretPatterns,
  inheritHashes,
  readonlyMountsFor,
  stepInSession,
  type BoxSession,
} from './world/repo-world.js';
import type { Plan, RepoState, ShellAction } from './world/types.js';

/** Exact Plan B disclosure (Req 3.4). */
export const PLAN_B_NOTICE = 'P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.';
/** Added for `box-image-missing` (design: Plan B flow). */
export const BOX_BUILD_HINT =
  'The box image is missing. Build it with: pnpm --filter @ghost-run/ghost-runner box:build';

export interface RunPlanOptions extends RunnerOptions {
  /** Docker client. Default: the `docker` CLI. Tests inject doubles. */
  readonly client?: DockerClient;
  /** Called synchronously with every user-facing notice (Plan B disclosure) as soon as it exists. */
  readonly onNotice?: (notice: string) => void;
  /** Clock for deadlines. Default: the system clock. */
  readonly clock?: DeadlineClock;
  /**
   * Aborts the run. On abort `runPlan` removes container, volume and Copy and rejects with
   * `signal.reason` (an AbortError by default). A step that is still in flight is cleaned up
   * again when it settles, so a box created after the abort is removed too.
   */
  readonly signal?: AbortSignal;
}

const systemClock: DeadlineClock = { now: () => Date.now() };

const NO_PHASES = (): PhaseDurations => ({
  dockerCheckMs: 0,
  fingerprintBeforeMs: 0,
  copyMs: 0,
  baselineMs: 0,
  boxOverheadMs: 0,
  execMs: 0,
  diffMs: 0,
  sqliteMs: 0,
  fingerprintAfterMs: 0,
  cleanupMs: 0,
});

// -- small helpers -------------------------------------------------------------

const perf = (): number => performance.now();

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function validateActions(plan: Plan): void {
  for (const a of plan as readonly unknown[]) {
    const o = a as Partial<ShellAction> | null;
    if (
      typeof o !== 'object' ||
      o === null ||
      typeof o.command !== 'string' ||
      (o.cwd !== undefined && typeof o.cwd !== 'string')
    ) {
      throw new TypeError('every action must be { command: string, cwd?: string }');
    }
  }
}

type Raced<T> = { readonly timedOut: false; readonly value: T } | { readonly timedOut: true };

/** Resolves `{ timedOut: true }` after `ms`; the underlying promise keeps running but never rejects unhandled. */
function raceTimeout<T>(p: Promise<T>, ms: number): Promise<Raced<T>> {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => res({ timedOut: true }), Math.max(0, ms));
    p.then(
      (value) => {
        clearTimeout(timer);
        res({ timedOut: false, value });
      },
      (e: unknown) => {
        clearTimeout(timer);
        rej(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function chmodRecursive(path: string): Promise<void> {
  return new Promise((done) => {
    const child = spawn('chmod', ['-R', 'u+rwX', '--', path], { stdio: 'ignore', shell: false });
    child.on('error', () => done());
    child.on('close', () => done());
  });
}

/** Removes a directory tree, retrying once after restoring owner permissions (an action may chmod 000). */
async function removeTree(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    await chmodRecursive(path);
    await rm(path, { recursive: true, force: true });
  }
}

async function assertDirectory(original: string): Promise<void> {
  const st = await stat(original).catch(() => undefined);
  if (st === undefined || !st.isDirectory()) {
    throw new ConfigError('original', 'existing directory', original);
  }
}

function capText(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

// -- Plan B ------------------------------------------------------------------------

/**
 * Plan B scan (read-only, lstat only): symbolic links of Original whose target lies outside
 * Original. Targets are resolved lexically, never followed.
 */
async function scanSymlinksOutside(original: string, excludeDirs: readonly string[]): Promise<Effect[]> {
  const roots = new Set([resolve(original)]);
  roots.add(await realpath(original).catch(() => resolve(original)));
  const entries = await walkManifest(original, { excludeDirs });
  const out: Effect[] = [];
  for (const e of entries) {
    if (e.type !== 'symlink' || e.target === undefined) continue;
    const abs = isAbsolute(e.target) ? normalize(e.target) : resolve(dirname(join(original, e.path)), e.target);
    const inside = [...roots].some((r) => abs === r || abs.startsWith(r.endsWith(sep) ? r : r + sep));
    if (!inside) out.push({ kind: 'symlink-outside-original', destination: e.target, path: e.path });
  }
  return out;
}

async function planB(
  plan: Plan,
  resolved: ResolvedRunnerOptions,
  original: string,
  avail: Extract<DockerAvailability, { available: false }>,
  runId: string,
  phases: PhaseDurations,
  onNotice: ((n: string) => void) | undefined,
): Promise<RunOutput> {
  const notices = [PLAN_B_NOTICE];
  if (avail.reason === 'box-image-missing') notices.push(BOX_BUILD_HINT);
  for (const n of notices) {
    try {
      onNotice?.(n);
    } catch {
      // a failing callback must not change the run
    }
  }

  const diagnostics: Diagnostic[] = protectedPathExcludedDiagnostics(
    detectProtectedPathExcluded(resolved.wardSet, resolved.excludeDirs, resolved.excludedDirMode),
  );
  const perAction = plan.map((a) => analyze(a));
  const staticFindings: Effect[] = perAction.flat();
  try {
    staticFindings.push(...(await scanSymlinksOutside(original, resolved.excludeDirs)));
  } catch (e) {
    diagnostics.push({
      name: 'plan-b-scan-failed',
      detail: { reason: e instanceof FingerprintReadError ? 'unreadable-path' : 'error' },
      ...(e instanceof FingerprintReadError ? { path: e.path } : {}),
    });
  }

  const report: GhostReport<RepoState> = {
    snapshots: [],
    changes: plan.map((): Change[] => []),
    effectsOutside: perAction,
    observedEvents: [],
    variantResults: [],
  };
  const wardVerdict = WardEngine.evaluate(report, resolved.wardSet);
  const status: RunStatus = 'ok';
  const isolation: Isolation = {
    mode: 'static-analysis',
    reason: avail.reason,
    p1Claimed: false,
    p5Claimed: false,
    p6Claimed: false,
    readOnlyMounts: [],
  };
  const result: RunResult = {
    schemaVersion: 1,
    runId,
    status,
    rehearsed: false,
    verdict: runnerVerdict({ status, mode: 'static-analysis', wardVerdict: wardVerdict.verdict, diagnostics }),
    wardVerdict,
    report,
    exitCodes: [],
    copy: { cloned: false, location: '' },
    isolation,
    recorder: { location: 'in-box', tamperResistant: false },
    captures: [],
    diagnostics,
    staticFindings,
    notices,
    phases,
  };
  return { result, payloads: new Map() };
}

// -- secretValues seam (task 12.8) ---------------------------------------------------

/**
 * Reads the contents of the Copy files that match the `secrets` of the `egress` wards into
 * memory (Req 9.1, 9.10-9.13, 9.15), after the Copier finishes and before the first action
 * runs. Returns `undefined` without an egress ward. Only egress `secrets` select files; the
 * default `secretPatterns` option does not. Files are ordered by UTF-8 byte order of the
 * Copy-relative path; only the first MAX_SECRET_FILES are read (an unreadable one counts),
 * each with a bounded read of MAX_SECRET_FILE_BYTES. Contents stay in the returned map;
 * diagnostics hold Copy-relative paths and lengths only. Symbolic links are never followed.
 */
export async function loadSecretValues(
  copyDir: string,
  wardSet: WardSet,
  excludeDirs: readonly string[],
  diagnostics: Diagnostic[],
): Promise<Map<string, Uint8Array> | undefined> {
  const patterns: string[] = [];
  let hasEgress = false;
  for (const w of wardSet.wards) {
    if (w.kind !== 'egress') continue;
    hasEgress = true;
    for (const s of w.secrets) if (!patterns.includes(s)) patterns.push(s);
  }
  if (!hasEgress) return undefined;

  const values = new Map<string, Uint8Array>();
  let entries: ManifestEntry[];
  try {
    entries = await walkManifest(copyDir, { excludeDirs });
  } catch (e) {
    diagnostics.push({
      name: 'secret-values-unreadable',
      path: e instanceof FingerprintReadError ? e.path : '.',
    });
    return values;
  }
  const matches = createSecretMatcher(patterns);
  const matching = entries
    .filter((e) => (e.type === 'file' || e.type === 'symlink' || e.type === 'other') && matches(e.path))
    .sort((a, b) => compareBytes(a.path, b.path));

  for (let i = 0; i < matching.length; i++) {
    const entry = matching[i] as ManifestEntry;
    if (i >= MAX_SECRET_FILES) {
      diagnostics.push({
        name: SECRET_VALUES_CAPPED,
        path: entry.path,
        detail: { reason: 'count', byteLength: entry.size, cap: MAX_SECRET_FILES },
      });
      continue;
    }
    if (entry.type !== 'file') {
      diagnostics.push({ name: 'secret-values-unreadable', path: entry.path });
      continue;
    }
    let handle: FileHandle | undefined;
    try {
      handle = await open(join(copyDir, entry.path), constants.O_RDONLY | constants.O_NOFOLLOW);
      const total = (await handle.stat()).size;
      const buf = Buffer.alloc(Math.min(total, MAX_SECRET_FILE_BYTES));
      let got = 0;
      while (got < buf.length) {
        const { bytesRead } = await handle.read(buf, got, buf.length - got, got);
        if (bytesRead === 0) break;
        got += bytesRead;
      }
      values.set(entry.path, new Uint8Array(buf.subarray(0, got)));
      if (total > MAX_SECRET_FILE_BYTES) {
        diagnostics.push({
          name: SECRET_VALUES_CAPPED,
          path: entry.path,
          detail: { reason: 'size', byteLength: total, cap: MAX_SECRET_FILE_BYTES },
        });
      }
    } catch {
      diagnostics.push({ name: 'secret-values-unreadable', path: entry.path });
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }
  return values;
}

// -- docker-box execution ----------------------------------------------------------

/** What `execute` learns. Mutated in place so `finally` and the assembly see partial progress. */
interface Run {
  status: RunStatus;
  readonly snapshots: Snapshot<RepoState>[];
  readonly changes: Change[][];
  readonly effects: Effect[][];
  readonly exitCodes: number[];
  observedEvents: readonly ObservedEvent[];
  captures: CaptureSummary[];
  payloads: ReadonlyMap<string, Uint8Array>;
  readonly diagnostics: Diagnostic[];
  wardVerdict?: WardVerdict;
  copy?: { cloned: boolean; location: string; copiedAtNs: string };
  mountAuditPassed: boolean;
  boxCreated: boolean;
  boxAttempted: boolean;
  box?: Box;
  copyDir?: string;
  recorderHealthy: boolean;
  originalClass?: OriginalClassification;
  fingerprintUnreadable: boolean;
  readOnlyMounts: string[];
}

type FpOutcome =
  | { readonly ok: true; readonly value: OriginalFingerprint; readonly ms: number }
  | { readonly ok: false; readonly error: unknown; readonly ms: number };

interface PipelineCtx {
  readonly plan: Plan;
  readonly resolved: ResolvedRunnerOptions;
  readonly original: string;
  readonly client: DockerClient;
  readonly clock: DeadlineClock;
  readonly runId: string;
  readonly deadlineAt: number;
  readonly avail: Extract<DockerAvailability, { available: true }>;
  readonly phases: PhaseDurations;
}

function newRun(): Run {
  return {
    status: 'ok',
    snapshots: [],
    changes: [],
    effects: [],
    exitCodes: [],
    observedEvents: [],
    captures: [],
    payloads: new Map(),
    diagnostics: [],
    mountAuditPassed: true,
    boxCreated: false,
    boxAttempted: false,
    recorderHealthy: true,
    fingerprintUnreadable: false,
    readOnlyMounts: [],
  };
}

async function execute(c: PipelineCtx, run: Run): Promise<void> {
  const { resolved, original, clock, phases } = c;
  const left = (): number => c.deadlineAt - clock.now();
  const excludeDirs = resolved.excludeDirs;
  const secretPatterns = effectiveSecretPatterns(resolved);

  run.diagnostics.push(
    ...protectedPathExcludedDiagnostics(
      detectProtectedPathExcluded(resolved.wardSet, excludeDirs, resolved.excludedDirMode),
    ),
  );

  // Original fingerprint, overlapped with box create. Never rejects; errors are values.
  const fpP: Promise<FpOutcome> = (async () => {
    const t = perf();
    try {
      const value = await fingerprintOriginal(original, { excludeDirs });
      return { ok: true, value, ms: perf() - t };
    } catch (error) {
      return { ok: false, error, ms: perf() - t };
    }
  })();

  type BoxAttempt =
    | { readonly kind: 'ok'; readonly box: Box }
    | { readonly kind: 'create-failed'; readonly detail: string; readonly cleanupDetail?: string }
    | { readonly kind: 'isolation-violation'; readonly differences: readonly string[]; readonly cleanupDetail?: string }
    | { readonly kind: 'threw'; readonly error: unknown };

  const boxP: Promise<BoxAttempt> = (async (): Promise<BoxAttempt> => {
    const t = perf();
    try {
      const placed = await placeCopy(original, c.runId, tmpdir());
      run.copyDir = placed.copyDir;
      const readonlyMounts = await readonlyMountsFor(original, excludeDirs, resolved.excludedDirMode);
      run.readOnlyMounts = readonlyMounts.map((m) => m.destination.replace(/^\/work\//, ''));
      run.boxAttempted = true;
      const created = await createBox(c.client, {
        runId: c.runId,
        image: c.avail.imageRef,
        imageEnv: c.avail.imageEnv,
        mounts: { copyDir: await realpath(placed.copyDir), readonlyMounts },
        limits: resolved.limits,
        uid: process.getuid?.() ?? 1000,
        gid: process.getgid?.() ?? 1000,
        execLimitMs: resolved.execLimitSec * 1000,
        deadlineAt: c.deadlineAt,
        clock,
      });
      if (created.ok) return { kind: 'ok', box: created.box };
      const cleanupDetail = created.cleanup.ok ? undefined : created.cleanup.detail;
      return created.kind === 'create-failed'
        ? { kind: 'create-failed', detail: created.detail, ...(cleanupDetail !== undefined ? { cleanupDetail } : {}) }
        : {
            kind: 'isolation-violation',
            differences: created.differences,
            ...(cleanupDetail !== undefined ? { cleanupDetail } : {}),
          };
    } catch (error) {
      return { kind: 'threw', error };
    } finally {
      phases.boxOverheadMs += perf() - t;
    }
  })();

  const [fpBefore, attempt] = await Promise.all([fpP, boxP]);
  phases.fingerprintBeforeMs = fpBefore.ms;

  if (attempt.kind === 'threw') throw attempt.error;
  if (attempt.kind !== 'ok') {
    if (attempt.cleanupDetail !== undefined) {
      run.diagnostics.push({ name: 'cleanup-failed', detail: { target: 'container', detail: capText(attempt.cleanupDetail) } });
    }
    if (attempt.kind === 'create-failed') {
      run.status = 'internal-error';
      run.diagnostics.push({ name: 'box-create-failed', detail: { detail: capText(attempt.detail) } });
    } else {
      run.status = 'isolation-violation';
      run.mountAuditPassed = false;
      run.diagnostics.push({
        name: 'isolation-violation',
        detail: { differences: capText(attempt.differences.join('; '), 500) },
      });
    }
    return;
  }
  const box = attempt.box;
  run.box = box;
  run.boxCreated = true;
  const copyDir = run.copyDir as string;

  let fp: OriginalFingerprint | undefined;
  if (fpBefore.ok) {
    fp = fpBefore.value;
  } else if (fpBefore.error instanceof FingerprintReadError) {
    run.fingerprintUnreadable = true;
    run.diagnostics.push({ name: 'fingerprint-unreadable', path: fpBefore.error.path });
  } else {
    throw fpBefore.error;
  }

  // Copy (20 s absolute limit, never beyond the pipeline deadline).
  if (left() <= 0) {
    run.status = 'pipeline-deadline';
    return;
  }
  const copyBudget = Math.min(COPY_LIMIT_SEC * 1000, left());
  const copyStart = perf();
  const copied = await copyOriginal({
    original,
    excludeDirs,
    runId: c.runId,
    targetDir: copyDir,
    timeoutMs: copyBudget,
  });
  phases.copyMs = perf() - copyStart;
  if (copied.status !== 'ok') {
    run.status = copyBudget < COPY_LIMIT_SEC * 1000 ? 'pipeline-deadline' : 'copy-timeout';
    return;
  }
  run.copy = { cloned: copied.cloned, location: copyDir, copiedAtNs: copied.copiedAtNs };

  // secretValues: in memory only, released after evaluation (task 12.8 fills the seam).
  let secretValues: Map<string, Uint8Array> | undefined;
  try {
    secretValues = await loadSecretValues(copyDir, resolved.wardSet, excludeDirs, run.diagnostics);

    // Baseline: host manifest walk in parallel with the in-box SQLite count (D3).
    if (left() <= 0) {
      run.status = 'pipeline-deadline';
      return;
    }
    const baseStart = perf();
    let entries: ManifestEntry[] | undefined;
    let counted: SqliteState = {};
    if (fp !== undefined) {
      const [walked, c0] = await Promise.all([walkManifest(copyDir, { excludeDirs }), box.countSqlite(fp.sqliteCandidates)]);
      const inherited = inheritHashes(walked, fp.entries);
      if (inherited.complete) {
        entries = inherited.entries;
        counted = c0;
      }
    }
    if (entries === undefined) {
      // No usable Original hashes (unreadable before, or Original changed during the copy): hash the Copy.
      const copyFp = await fingerprintOriginal(copyDir, { excludeDirs, fingerprintMode: 'full' });
      entries = [...copyFp.entries];
      counted = await box.countSqlite(copyFp.sqliteCandidates);
    }
    const files = new Set(entries.filter((e) => e.type === 'file').map((e) => e.path));
    const sqlite0 = nextSqliteState({}, counted, files);
    for (const [path, v] of Object.entries(sqlite0)) {
      if (v === 'unreadable') run.diagnostics.push({ name: 'sqlite-unreadable', path });
    }
    phases.baselineMs = perf() - baseStart;

    const state0: RepoState = { rootPath: copyDir, entries, sqlite: sqlite0 };
    run.snapshots.push({ id: 'repo-0', state: state0, result: { success: true } });

    // Step loop.
    const timings = { sqliteMs: 0 };
    const session: BoxSession = {
      box,
      copyDir,
      sentinelPath: copied.sentinelPath,
      excludeDirs,
      secretPatterns,
      collectPerStep: false,
      eventBuilder: new EventBuilder(),
      payloads: new Map(),
      cwds: [],
      timings,
      entries,
      sqlite: sqlite0,
      baselineNs: copied.copiedAtNs,
    };
    for (let i = 0; i < c.plan.length; i++) {
      if (left() <= 0) {
        run.status = 'pipeline-deadline';
        break;
      }
      const action = c.plan[i] as ShellAction;
      const stepStart = perf();
      const sqliteBefore = timings.sqliteMs;
      const r = await stepInSession(session, i, action);
      const stepMs = perf() - stepStart;
      const execMs = r.outcome.kind === 'error' ? 0 : r.outcome.durationMs;
      phases.execMs += execMs;
      phases.diffMs += Math.max(0, stepMs - execMs - (timings.sqliteMs - sqliteBefore));

      const diffStart = perf();
      const prev = run.snapshots[i] as Snapshot<RepoState>;
      let error = r.error;
      if (r.outcome.kind === 'timeout') {
        if (r.outcome.reason === 'exec-limit') {
          run.status = 'timeout';
          error = `timeout after ${String(resolved.execLimitSec)} s`;
        } else {
          run.status = 'pipeline-deadline';
          error = `pipeline deadline of ${String(resolved.pipelineDeadlineSec)} s reached`;
        }
      }
      const snap: Snapshot<RepoState> = {
        id: `repo-${String(i + 1)}`,
        state: r.state,
        result: error === undefined ? { success: true } : { success: false, error },
      };
      run.snapshots.push(snap);
      run.changes.push(diffStates(prev.state, snap.state));
      run.effects.push(analyze(action));
      run.exitCodes.push(r.outcome.kind === 'exited' ? r.outcome.exitCode : -1);
      run.diagnostics.push(...(snap.state.lastStep?.diagnostics ?? []), ...diffDiagnostics(prev.state, snap.state, i));
      phases.diffMs += perf() - diffStart;
      if (run.status !== 'ok') break;
    }
    phases.sqliteMs = timings.sqliteMs;

    // Recorder: read once, after the last executed step (also after a kill).
    const executed = run.exitCodes.length;
    if (executed > 0) {
      const rec = await box.collect({
        executedSteps: executed,
        cwds: session.cwds,
        secretPatterns,
        eventBuilder: session.eventBuilder,
      });
      run.observedEvents = rec.events;
      run.captures = [...rec.payloadCaptures];
      run.payloads = rec.payloads;
      run.recorderHealthy = rec.recorderOk;
      run.diagnostics.push(...rec.diagnostics);
    }

    // Original fingerprint after the last action (stat shortcut, D3).
    const fpLeft = left();
    if (fp !== undefined && fpLeft > 0) {
      const afterStart = perf();
      try {
        const after = await raceTimeout(fingerprintOriginal(original, { excludeDirs, baseline: fp }), fpLeft);
        if (after.timedOut) {
          run.status = 'pipeline-deadline';
        } else {
          run.originalClass = classifyOriginalChange(fp.fingerprint, after.value.fingerprint, run.mountAuditPassed);
        }
      } catch (e) {
        if (!(e instanceof FingerprintReadError)) throw e;
        run.fingerprintUnreadable = true;
        run.diagnostics.push({ name: 'fingerprint-unreadable', path: e.path });
      }
      phases.fingerprintAfterMs = perf() - afterStart;
    } else if (fp !== undefined) {
      run.status = 'pipeline-deadline';
    }

    // A path that changed in Original during the run and also shows up as a Change may be a
    // baseline artefact rather than a ghost action (D3).
    const externallyChanged = run.originalClass?.originalChange?.changedPaths;
    if (externallyChanged !== undefined && externallyChanged.length > 0) {
      const changedByGhost = new Set<string>();
      for (const ch of run.changes.flat()) {
        if (typeof ch['path'] === 'string') changedByGhost.add(ch['path']);
      }
      for (const p of externallyChanged) {
        if (changedByGhost.has(p) && !run.diagnostics.some((d) => d.name === 'baseline-race' && d.path === p)) {
          run.diagnostics.push({ name: 'baseline-race', path: p, detail: { origin: 'original-changed-during-run' } });
        }
      }
    }

    // Ward evaluation. `payloads` holds only captured network bodies; `secretValues` never
    // leaves this function and is cleared right after (task 12.8).
    const report = buildReport(run);
    run.wardVerdict = WardEngine.evaluate(report, resolved.wardSet, {
      payloads: run.payloads,
      ...(secretValues !== undefined ? { secretValues } : {}),
    });
  } finally {
    secretValues?.clear();
    secretValues = undefined;
  }
}

function buildReport(run: Run): GhostReport<RepoState> {
  return {
    snapshots: run.snapshots,
    changes: run.changes,
    effectsOutside: run.effects,
    observedEvents: run.observedEvents,
    variantResults: [],
  };
}

/** Removes container, volume, and Copy. Never throws; failures become diagnostics. */
async function cleanup(c: PipelineCtx, run: Run): Promise<void> {
  const start = perf();
  try {
    if (run.boxAttempted) {
      const r = run.box !== undefined ? await run.box.cleanup() : await removeRunContainers(c.client, c.runId);
      if (!r.ok) {
        run.diagnostics.push({ name: 'cleanup-failed', detail: { target: 'container', detail: capText(r.detail ?? 'unknown') } });
      }
    }
  } catch (e) {
    run.diagnostics.push({ name: 'cleanup-failed', detail: { target: 'container', detail: capText(message(e)) } });
  }
  if (run.copyDir !== undefined) {
    for (const p of [run.copyDir, sentinelPathFor(run.copyDir)]) {
      try {
        await removeTree(p);
      } catch (e) {
        run.diagnostics.push({ name: 'cleanup-failed', detail: { target: 'copy', detail: capText(message(e)) } });
      }
    }
  }
  c.phases.cleanupMs = perf() - start;
}

function assemble(c: PipelineCtx, run: Run): RunOutput {
  const { resolved } = c;
  const executed = run.exitCodes.length;
  const mode = 'docker-box' as const;
  const oc = run.originalClass;
  const originalChange = oc?.originalChange;
  const egressWardPresent = resolved.wardSet.wards.some((w) => w.kind === 'egress');
  const fingerprintsEqual = oc?.originalUnchanged === true && !run.fingerprintUnreadable;

  const claims = {
    mode,
    diagnostics: run.diagnostics,
    fingerprintsEqual,
    mountAuditPassed: run.mountAuditPassed && run.boxCreated,
    secretReadRecordingActive: run.boxCreated,
    recorderHealthy: run.recorderHealthy,
  };
  const isolation: Isolation = {
    mode,
    p1Claimed: p1Claimed(claims),
    p5Claimed: p5Claimed(claims),
    p6Claimed: p6Claimed(claims),
    ...(oc !== undefined ? { originalUnchanged: oc.originalUnchanged } : {}),
    readOnlyMounts: run.readOnlyMounts,
    mountAuditPassed: run.mountAuditPassed && run.boxCreated,
  };

  const verdict: Verdict = runnerVerdict({
    status: run.status,
    mode,
    ...(run.wardVerdict !== undefined ? { wardVerdict: run.wardVerdict.verdict } : {}),
    diagnostics: run.diagnostics,
    ...(originalChange !== undefined ? { originalChange } : {}),
    fingerprintUnreadable: run.fingerprintUnreadable,
    egressWardPresent,
    secretReadRecordingActive: run.boxCreated,
  });

  const result: RunResult = {
    schemaVersion: 1,
    runId: c.runId,
    status: run.status,
    rehearsed: executed > 0,
    verdict,
    ...(run.wardVerdict !== undefined ? { wardVerdict: run.wardVerdict } : {}),
    report: buildReport(run),
    exitCodes: run.exitCodes,
    ...(run.copy !== undefined ? { copiedAt: run.copy.copiedAtNs } : {}),
    copy: run.copy !== undefined ? { cloned: run.copy.cloned, location: run.copy.location } : { cloned: false, location: '' },
    ...(run.boxCreated ? { box: { source: 'fresh' as const, image: c.avail.tag } } : {}),
    isolation,
    ...(originalChange !== undefined ? { originalChange } : {}),
    recorder: { location: 'in-box', tamperResistant: false },
    captures: run.captures,
    diagnostics: run.diagnostics,
    staticFindings: [],
    notices: [],
    phases: c.phases,
  };
  return { result, payloads: run.payloads };
}

/**
 * Rehearses `plan` against a Copy of `opts.original`. Throws `PlanBoundsError` or `ConfigError`
 * for invalid input before anything is created. Without Docker (or without the box image) it
 * returns a Plan B result and executes nothing. After the Copier starts, container, volume and
 * Copy are removed even when an error is thrown; cleanup problems never mask that error.
 */
export async function runPlan(plan: Plan, opts: RunPlanOptions): Promise<RunOutput> {
  validatePlanSize(plan.length);
  const resolved = resolveRunnerOptions(opts);
  validateActions(plan);
  const original = resolve(resolved.original);
  await assertDirectory(original);
  const image = resolved.image ?? imageFromEnv(process.env);

  const clock = opts.clock ?? systemClock;
  const client = opts.client ?? createDockerClient('docker', clock);
  let deadlineAt = clock.now() + resolved.pipelineDeadlineSec * 1000;
  const runId = resolved.runId ?? randomUUID();
  const phases = NO_PHASES();

  const checkStart = perf();
  const avail = await checkDockerAvailability(client, { ...(image !== undefined ? { image } : {}), clock });
  phases.dockerCheckMs = perf() - checkStart;
  if (!avail.available) return planB(plan, resolved, original, avail, runId, phases, opts.onNotice);

  // Stale-box sweep (Req 16.7): once per process, outside the timed phases. Its time does not
  // count toward the pipeline deadline; errors become a diagnostic and never fail the run.
  const sweepDiagnostics: Diagnostic[] = [];
  const sweepStart = clock.now();
  const swept = await sweepStaleBoxesOnce(client);
  deadlineAt += Math.max(0, clock.now() - sweepStart);
  if (swept?.error !== undefined) {
    sweepDiagnostics.push({ name: 'stale-sweep-failed', detail: { detail: capText(swept.error), removed: swept.removed } });
  }

  const ctx: PipelineCtx = { plan, resolved, original, client, clock, runId, deadlineAt, avail, phases };
  const run = newRun();
  run.diagnostics.push(...sweepDiagnostics);
  if (resolved.runId !== undefined) {
    // Before the try/finally: a duplicate must never reach cleanup, which removes by label.
    const dup = await findRunIdContainers(client, runId);
    if (!dup.ok) {
      run.diagnostics.push({ name: 'run-id-check-failed', detail: { detail: capText(dup.detail) } });
    } else if (dup.ids.length > 0) {
      throw new ConfigError('runId', 'a run id not used by an existing ghost-run container', runId);
    }
  }
  const signal = opts.signal;
  try {
    if (signal === undefined) {
      await execute(ctx, run);
    } else {
      signal.throwIfAborted();
      const work = execute(ctx, run);
      let onAbort: (() => void) | undefined;
      const aborted = new Promise<never>((_, reject) => {
        onAbort = (): void => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        await Promise.race([work, aborted]);
      } catch (e) {
        if (signal.aborted) {
          // `work` keeps running; remove whatever it creates once it settles.
          void work.then(() => undefined, () => undefined).then(() => cleanup(ctx, run)).catch(() => undefined);
        }
        throw e;
      } finally {
        if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
      }
    }
  } finally {
    await cleanup(ctx, run);
  }
  return assemble(ctx, run);
}
