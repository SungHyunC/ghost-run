// Ghost Run+ core contract: all exported types. No runtime dependencies.

// -- Snapshot ----------------------------------------------------------------

/**
 * An immutable value-object capturing the full state of a World at one point
 * in time. Once created it is never mutated by any World method.
 * `result` records the outcome of the last action applied to reach this snapshot.
 * The initial snapshot (before any action) carries `{ success: true }`.
 */
export interface Snapshot<S> {
  /** Unique within one World instance's lifetime. */
  readonly id: string;
  readonly state: S;
  readonly result:
    | { readonly success: true }
    | { readonly success: false; readonly error: string };
}

// -- Change ------------------------------------------------------------------

export interface Change {
  readonly kind: string;
  readonly [key: string]: unknown;
}

// -- Well-known Change shapes ------------------------------------------------

/**
 * File-level change. A world implementation MUST emit Changes in exactly this
 * shape (kind + path) for the WardEngine to judge `path` wards. Changes with
 * any other shape are ignored by the engine.
 */
export interface FileChange extends Change {
  readonly kind:
    | 'file-created'
    | 'file-overwritten'
    | 'file-deleted'
    | 'symlink-changed';
  readonly path: string;
  /** symlink-changed only: link target before the step. */
  readonly targetBefore?: string;
  /** symlink-changed only: link target after the step. */
  readonly targetAfter?: string;
}

/**
 * Per-table SQLite row count change. A world implementation MUST emit Changes
 * in exactly this shape (one per affected table per step) for the WardEngine
 * to judge `sql` wards. Rows lost = rowsBefore - rowsAfter when positive.
 */
export interface SqlRowCountChange extends Change {
  readonly kind: 'sql-row-count';
  readonly table: string;
  readonly rowsBefore: number;
  readonly rowsAfter: number;
  /** True only when the table no longer exists; then rowsAfter is 0. */
  readonly dropped?: boolean;
}

// -- Scene -------------------------------------------------------------------

export type ScenePrimitive = string | number | boolean | null;
export type SceneValue =
  | ScenePrimitive
  | SceneValue[]
  | { [key: string]: SceneValue };

export interface Scene {
  readonly [key: string]: SceneValue;
}

// -- Effect ------------------------------------------------------------------

export interface Effect {
  readonly kind: string;
  readonly destination: string;
  readonly [key: string]: unknown;
}

// -- Verdict -----------------------------------------------------------------

/** pass < warn < block in strictness order. */
export type Verdict = 'pass' | 'warn' | 'block';

export const VERDICT_ORDER: Readonly<Record<Verdict, number>> = {
  pass: 0,
  warn: 1,
  block: 2,
} as const;

// -- FingerprintResult -------------------------------------------------------

/**
 * Return value of World.fingerprint().
 *
 * `hash`     - hex or base64 string from a cryptographic hash (Web Crypto
 *              SHA-256) over all tracked resources.
 * `manifest` - per-resource hash map keyed by resource path. Callers compute
 *              changed paths with compareFingerprints().
 */
export interface FingerprintResult {
  readonly hash: string;
  readonly manifest: Readonly<Record<string, string>>;
}

// -- Ward --------------------------------------------------------------------

/**
 * A single guard rule as declared in wards.yaml.
 * `id` uniquely identifies the ward within a WardSet; `kind` is the discriminant.
 */
export type Ward =
  | {
      readonly id: string;
      readonly kind: 'path';
      /** Operations to deny on matched paths. */
      readonly deny: ReadonlyArray<'delete' | 'overwrite'>;
      readonly paths: readonly string[];
      /** Match paths case-sensitively. Absent means false. */
      readonly case_sensitive?: boolean;
    }
  | {
      readonly id: string;
      readonly kind: 'sql';
      readonly tables: readonly string[];
      /** Maximum number of rows that may be lost across all protected tables. */
      readonly max_rows_lost: number;
    }
  | {
      readonly id: string;
      readonly kind: 'egress';
      readonly secrets: readonly string[];
      readonly allow_hosts: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: 'physics';
      /** 0 to 1. */
      readonly min_success_rate: number;
      /** Newtons. */
      readonly max_contact_force_n: number;
      readonly forbidden_contacts: readonly string[];
    };

// -- WardSet -----------------------------------------------------------------

/** The full set of guard rules for a world, parsed from wards.yaml. */
export interface WardSet {
  readonly wards: readonly Ward[];
}

// -- GhostReport -------------------------------------------------------------

/**
 * Full output of a ghost run. WardEngine.evaluate() receives this.
 *
 * `changes`        - per-step Change arrays, one entry per action.
 * `observedEvents` - network attempts and secret-file reads observed inside
 *                    the Box that were not listed in effectsOutside.
 * `effectsOutside` - statically known out-of-box side effects from each step.
 * `variantResults` - physics variant outcomes (empty for non-physics worlds).
 */
export interface GhostReport<S> {
  readonly snapshots: readonly Snapshot<S>[];
  readonly changes: readonly Change[][];
  readonly effectsOutside: readonly Effect[][];
  readonly observedEvents: readonly ObservedEvent[];
  readonly variantResults: readonly VariantResult[];
}

export interface ObservedEvent {
  readonly kind: 'network-attempt' | 'secret-read';
  readonly destination?: string;
  readonly path?: string;
  readonly stepIndex: number;
  /** Set only on events that have a captured payload. */
  readonly eventId?: string;
}

export interface VariantResult {
  readonly variantId: string;
  readonly success: boolean;
  readonly contactForceN?: number;
  readonly forbiddenContactOccurred?: boolean;
}

// -- Evaluate hand-off types -------------------------------------------------

/**
 * Contents of secret files, keyed by Copy-relative path with '/' separators.
 */
export type SecretValues = ReadonlyMap<string, Uint8Array>;

/** Optional in-memory inputs for WardEngine.evaluate (never serialized). */
export interface EvaluateInputs {
  readonly secretValues?: SecretValues;
  /** Captured payload bytes keyed by ObservedEvent.eventId. */
  readonly payloads?: ReadonlyMap<string, Uint8Array>;
}

// -- WardVerdict -------------------------------------------------------------

export interface WardViolation {
  readonly wardId: string;
  readonly wardKind: Ward['kind'];
  /** Human-readable reason, e.g. "would delete 1,206 rows from users". */
  readonly reason: string;
}

/**
 * A warn-level finding: a side effect outside the copy that needs human
 * approval. Independent of wards (it exists even with an empty WardSet).
 */
export interface WardNotice {
  readonly kind:
    | 'effect-outside'
    | 'observed-event'
    | 'content-inspection'
    | 'path-escape';
  readonly reason: string;
  /** Index of the action (effect-outside) or event step (observed-event). */
  readonly stepIndex: number;
  readonly destination?: string;
  readonly path?: string;
}

export interface WardVerdict {
  readonly verdict: Verdict;
  readonly violations: readonly WardViolation[];
  /** One entry per effectsOutside entry / observedEvent that causes warn. */
  readonly notices: readonly WardNotice[];
}

// -- World<S, A> -------------------------------------------------------------

export interface World<S, A> {
  /** Capture a copy of current real-world state. Must not modify reality. */
  snapshot(): Promise<Snapshot<S>>;

  /** Apply one action to a snapshot copy. Must not modify reality or the input snapshot. */
  step(s: Snapshot<S>, a: A): Promise<Snapshot<S>>;

  /** Return the minimal Change[] between two snapshots. Pure function. */
  diff(before: Snapshot<S>, after: Snapshot<S>): Change[];

  /** Return a JSON-serialisable Scene for the UI kit. Pure function. */
  render(s: Snapshot<S>): Scene;

  /**
   * Return a cryptographic fingerprint (Web Crypto SHA-256) of real-world
   * state plus a per-resource manifest. Must not trigger any external Effect.
   */
  fingerprint(): Promise<FingerprintResult>;

  /**
   * Return a best-effort list of Effects an action is statically known to
   * produce outside the copied world. Must not perform any I/O.
   */
  effectsOutside(a: A): Effect[];
}
