/**
 * RunResult types and the canonical serializer. Payload bytes and secret values
 * are never part of a RunResult; only lengths and SHA-256 hashes are stored.
 */
import { createHash } from 'node:crypto';
import type { Effect, GhostReport, Snapshot, Verdict, WardVerdict } from '@ghost-run/core';

export type RunStatus =
  | 'ok'
  | 'timeout'
  | 'pipeline-deadline'
  | 'copy-timeout'
  | 'isolation-violation'
  | 'internal-error';

export interface Isolation {
  mode: 'docker-box' | 'static-analysis';
  reason?: 'docker-unavailable' | 'box-image-missing';
  p1Claimed: boolean;
  p5Claimed: boolean;
  p6Claimed: boolean;
  originalUnchanged?: boolean;
  readOnlyMounts: string[];
  mountAuditPassed?: boolean;
}

export interface PhaseDurations {
  dockerCheckMs: number;
  fingerprintBeforeMs: number;
  copyMs: number;
  baselineMs: number;
  boxOverheadMs: number;
  execMs: number;
  diffMs: number;
  sqliteMs: number;
  fingerprintAfterMs: number;
  cleanupMs: number;
}

/**
 * A fact without a core Change kind. Never holds file content.
 * `name` examples: 'mode-changed', 'sqlite-unreadable', 'recorder-failure',
 * 'secret-values-unreadable', 'secret-values-capped', 'protected-path-excluded',
 * 'baseline-race', 'diff-unstable'.
 *
 * `secret-values-capped` carries `path` (Copy-relative) and
 * `detail { reason: 'count' | 'size', byteLength, cap }`, lengths only.
 */
export interface Diagnostic {
  readonly name: string;
  readonly stepIndex?: number;
  readonly path?: string;
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

/** Name of the diagnostic emitted when a secret file is skipped or truncated by a cap. */
export const SECRET_VALUES_CAPPED = 'secret-values-capped' as const;

/** Minimal structural view of the runner's RepoState that the result needs. */
export interface ResultRepoState {
  readonly rootPath: string;
  readonly entries: readonly unknown[];
}

export interface CaptureSummary {
  eventId: string;
  byteLength: number;
  sha256: string;
}

export interface RunResult {
  schemaVersion: 1;
  runId: string;
  status: RunStatus;
  rehearsed: boolean;
  verdict: Verdict;
  wardVerdict?: WardVerdict;
  report: GhostReport<ResultRepoState>;
  exitCodes: number[];
  copiedAt?: string;
  copy: { cloned: boolean; location: string };
  box?: { source: 'fresh' | 'pool'; image: string };
  isolation: Isolation;
  originalChange?: {
    classification: 'external-change' | 'isolation-violation';
    changedPaths: string[];
  };
  recorder: { location: 'in-box'; tamperResistant: false };
  captures: CaptureSummary[];
  diagnostics: Diagnostic[];
  staticFindings: Effect[];
  notices: string[];
  phases: PhaseDurations;
  /** True when the first Docker availability check timed out and the wake retry ran (Req 3.8). */
  dockerWakeRetried?: boolean;
}

export interface RunOutput {
  readonly result: RunResult;
  /** In memory only. Key = ObservedEvent.eventId of exactly one event. Never holds secretValues. */
  readonly payloads: ReadonlyMap<string, Uint8Array>;
}

export interface SerializedSnapshotState {
  rootPath: string;
  entryCount: number;
  manifestDigest: string;
}

export type SerializedRunResult = Omit<RunResult, 'report'> & {
  report: Omit<GhostReport<ResultRepoState>, 'snapshots'> & {
    snapshots: Snapshot<SerializedSnapshotState>[];
  };
};

// -- canonical JSON helpers ----------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Deep copy to plain JSON: sorted keys, undefined dropped, bigint and non-finite numbers rejected. */
function canonicalize(v: unknown, path = '$'): Json {
  if (v === null) return null;
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return v;
    case 'number':
      if (!Number.isFinite(v)) throw new TypeError(`non-finite number at ${path}`);
      return v;
    case 'bigint':
      throw new TypeError(`bigint at ${path}; use a decimal string`);
    case 'undefined':
    case 'function':
    case 'symbol':
      return null;
    default:
      break;
  }
  if (Array.isArray(v)) return v.map((x, i) => canonicalize(x, `${path}[${i}]`));
  if (v instanceof Uint8Array || v instanceof Map || v instanceof Set) {
    throw new TypeError(`non-serializable value at ${path}`);
  }
  const obj = v as Record<string, unknown>;
  const out: { [k: string]: Json } = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    if (val === undefined) continue;
    out[key] = canonicalize(val, `${path}.${key}`);
  }
  return out;
}

function isSerializedState(s: unknown): s is SerializedSnapshotState {
  const o = s as Partial<SerializedSnapshotState> & { entries?: unknown };
  return (
    !Array.isArray(o.entries) &&
    typeof o.rootPath === 'string' &&
    typeof o.entryCount === 'number' &&
    typeof o.manifestDigest === 'string'
  );
}

function reduceState(state: ResultRepoState | SerializedSnapshotState): SerializedSnapshotState {
  // Already reduced (a parsed RunResult being re-serialized): keep as is so that
  // serialization is idempotent.
  if (isSerializedState(state)) {
    return { rootPath: state.rootPath, entryCount: state.entryCount, manifestDigest: state.manifestDigest };
  }
  const manifestDigest = createHash('sha256')
    .update(JSON.stringify(canonicalize(state.entries)))
    .digest('hex');
  return { rootPath: state.rootPath, entryCount: state.entries.length, manifestDigest };
}

/**
 * Reduces a RunResult to its serializable form: snapshots become
 * { rootPath, entryCount, manifestDigest }; payload bytes are not part of a
 * RunResult. The output is plain canonical JSON data, so
 * parseRunResult(serializeRunResult(r)) deep-equals redact(r).
 */
export function redact(r: RunResult): SerializedRunResult {
  const reduced = {
    ...r,
    report: {
      ...r.report,
      snapshots: r.report.snapshots.map((s) => ({
        id: s.id,
        result: s.result,
        state: reduceState(s.state),
      })),
    },
  };
  return canonicalize(reduced) as unknown as SerializedRunResult;
}

export function serializeRunResult(r: RunResult): string {
  return JSON.stringify(canonicalize(redact(r)));
}

export function parseRunResult(json: string): SerializedRunResult {
  const v: unknown = JSON.parse(json);
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new TypeError('RunResult JSON must be an object');
  }
  const o = v as Record<string, unknown>;
  if (o['schemaVersion'] !== 1) throw new TypeError('unsupported RunResult schemaVersion');
  for (const key of ['runId', 'status', 'verdict', 'report', 'isolation', 'phases'] as const) {
    if (o[key] === undefined) throw new TypeError(`RunResult is missing "${key}"`);
  }
  return v as SerializedRunResult;
}
