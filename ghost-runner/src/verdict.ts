/**
 * Runner verdict, isolation claims, Original-change classification, and
 * protected-path-excluded detection. Everything here is pure: no I/O, no clock.
 */
import { compareFingerprints, VERDICT_ORDER } from '@ghost-run/core';
import type { FingerprintResult, Verdict, WardSet } from '@ghost-run/core';
import type { ExcludedDirMode } from './config.js';
import type { Diagnostic, RunStatus } from './result.js';

export type { RunStatus };
/** Kept as an alias so existing importers keep compiling. */
export type DiagnosticLike = Diagnostic;

export type IsolationMode = 'docker-box' | 'static-analysis';

export type OriginalChangeClassification = 'external-change' | 'isolation-violation';

export interface OriginalChange {
  readonly classification: OriginalChangeClassification;
  readonly changedPaths: string[];
}

/** Diagnostic names that raise the floor to at least `warn`. */
export const WARN_FLOOR_DIAGNOSTICS: readonly string[] = Object.freeze([
  'recorder-failure',
  'secret-values-unreadable',
  'sqlite-unreadable',
  'protected-path-excluded',
]);

function maxVerdict(a: Verdict, b: Verdict): Verdict {
  return VERDICT_ORDER[a] >= VERDICT_ORDER[b] ? a : b;
}

function hasDiagnostic(diagnostics: readonly DiagnosticLike[], name: string): boolean {
  return diagnostics.some((d) => d.name === name);
}

// -- Runner verdict ----------------------------------------------------------

export interface VerdictInputs {
  readonly status: RunStatus;
  readonly mode: IsolationMode;
  /** Verdict from WardEngine.evaluate; absent when no evaluation happened. */
  readonly wardVerdict?: Verdict;
  readonly diagnostics: readonly DiagnosticLike[];
  readonly originalChange?: { readonly classification: OriginalChangeClassification };
  /** True when a tracked Original file could not be read (FingerprintReadError). */
  readonly fingerprintUnreadable?: boolean;
  /** True when the ward set contains at least one egress ward. */
  readonly egressWardPresent?: boolean;
  /** True when secret-read recording is active. Only relevant with an egress ward. */
  readonly secretReadRecordingActive?: boolean;
}

/** Lowest verdict the runner may report, independent of the wards. */
export function verdictFloor(i: VerdictInputs): Verdict {
  if (i.status === 'isolation-violation' || i.originalChange?.classification === 'isolation-violation') {
    return 'block';
  }
  if (
    i.status !== 'ok' ||
    i.mode === 'static-analysis' ||
    i.diagnostics.some((d) => WARN_FLOOR_DIAGNOSTICS.includes(d.name)) ||
    i.originalChange?.classification === 'external-change' ||
    i.fingerprintUnreadable === true ||
    (i.egressWardPresent === true && i.secretReadRecordingActive !== true)
  ) {
    return 'warn';
  }
  return 'pass';
}

/** Maximum of the ward verdict (default `pass`) and the floor. */
export function runnerVerdict(i: VerdictInputs): Verdict {
  return maxVerdict(i.wardVerdict ?? 'pass', verdictFloor(i));
}

// -- Claims ------------------------------------------------------------------

export interface ClaimInputs {
  readonly mode: IsolationMode;
  readonly diagnostics: readonly DiagnosticLike[];
  /** True only when both fingerprints were read and compare equal. */
  readonly fingerprintsEqual: boolean;
  readonly mountAuditPassed: boolean;
  readonly secretReadRecordingActive: boolean;
  readonly recorderHealthy: boolean;
}

export function p1Claimed(c: Pick<ClaimInputs, 'mode' | 'fingerprintsEqual' | 'mountAuditPassed'>): boolean {
  return c.mode === 'docker-box' && c.fingerprintsEqual && c.mountAuditPassed;
}

export function p5Claimed(c: Pick<ClaimInputs, 'mode' | 'fingerprintsEqual' | 'mountAuditPassed' | 'diagnostics'>): boolean {
  return p1Claimed(c) && !hasDiagnostic(c.diagnostics, 'protected-path-excluded');
}

export function p6Claimed(
  c: Pick<ClaimInputs, 'mode' | 'diagnostics' | 'secretReadRecordingActive' | 'recorderHealthy'>,
): boolean {
  return (
    c.mode === 'docker-box' &&
    c.secretReadRecordingActive &&
    c.recorderHealthy &&
    !hasDiagnostic(c.diagnostics, 'recorder-failure') &&
    !hasDiagnostic(c.diagnostics, 'secret-values-unreadable')
  );
}

// -- Original change classification -----------------------------------------

export interface OriginalClassification {
  readonly originalUnchanged: boolean;
  readonly originalChange?: OriginalChange;
}

/**
 * Compare the Original fingerprints taken before and after the run.
 * Equal: unchanged. Different with a passed mount audit: `external-change`
 * (a host process changed Original; no Original path is mounted read-write).
 * Different with a failed audit: `isolation-violation`.
 */
export function classifyOriginalChange(
  before: FingerprintResult,
  after: FingerprintResult,
  mountAuditPassed: boolean,
): OriginalClassification {
  const { changed, changedPaths } = compareFingerprints(before, after);
  if (!changed && changedPaths.length === 0) return { originalUnchanged: true };
  return {
    originalUnchanged: false,
    originalChange: {
      classification: mountAuditPassed ? 'external-change' : 'isolation-violation',
      changedPaths: [...changedPaths],
    },
  };
}

// -- Protected paths inside excluded directories -----------------------------

export interface ProtectedPathExcluded {
  readonly wardId: string;
  readonly path: string;
}

/**
 * True when `glob` has one of `excludeDirs` as a literal path segment
 * (Property 10: "has an excluded directory name as a segment"). Wildcard
 * segments such as `**` or `*.pem` are not directory names and do not count.
 */
export function globCanMatchExcludedDir(glob: string, excludeDirs: readonly string[]): boolean {
  if (excludeDirs.length === 0) return false;
  return glob.split('/').some((seg) => seg !== '' && seg !== '.' && excludeDirs.includes(seg));
}

/**
 * Every (ward id, protected glob) pair of a `path` ward whose glob can match a
 * path inside an excluded directory. The result is the same for both
 * `excludedDirMode` values: in `omit` the directory is absent from the Copy,
 * in `readonly-mount` it is mounted read-only, and in both cases changes there
 * are not visible to the Differ.
 */
export function detectProtectedPathExcluded(
  wardSet: WardSet | undefined,
  excludeDirs: readonly string[],
  _mode: ExcludedDirMode,
): ProtectedPathExcluded[] {
  const out: ProtectedPathExcluded[] = [];
  for (const ward of wardSet?.wards ?? []) {
    if (ward.kind !== 'path') continue;
    for (const p of ward.paths) {
      if (globCanMatchExcludedDir(p, excludeDirs)) out.push({ wardId: ward.id, path: p });
    }
  }
  return out;
}

/** Diagnostics for `detectProtectedPathExcluded` findings. Never holds content. */
export function protectedPathExcludedDiagnostics(found: readonly ProtectedPathExcluded[]): DiagnosticLike[] {
  return found.map((f) => ({
    name: 'protected-path-excluded',
    path: f.path,
    detail: {
      wardId: f.wardId,
      note: 'changes inside an excluded directory are not visible to the Differ',
    },
  }));
}
