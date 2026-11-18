/** Error types of the ghost runner. All carry a stable `code` and name the violated bound. */

/** Thrown when the plan size is outside 1..50. Raised before any container is created. */
export class PlanBoundsError extends Error {
  readonly code = 'plan-bounds' as const;
  readonly bound: string;
  readonly actual: number;

  constructor(bound: string, actual: number) {
    super(`plan size ${actual} violates bound ${bound}`);
    this.name = 'PlanBoundsError';
    this.bound = bound;
    this.actual = actual;
  }
}

/** Thrown when a RunnerOptions value is outside its valid range. Raised before any container is created. */
export class ConfigError extends Error {
  readonly code = 'config' as const;
  readonly option: string;
  readonly bound: string;

  constructor(option: string, bound: string, actual: unknown) {
    super(`option ${option} violates bound ${bound} (got ${describe(actual)})`);
    this.name = 'ConfigError';
    this.option = option;
    this.bound = bound;
  }
}

/**
 * Thrown when a tracked Original file cannot be read while fingerprinting.
 * Core does not export a class of this name, so the runner defines it
 * (core-contract design: "Throws FingerprintReadError naming the unreadable resource").
 */
export class FingerprintReadError extends Error {
  readonly code = 'fingerprint-read' as const;
  readonly path: string;

  constructor(path: string, cause?: unknown) {
    super(`cannot read tracked file during fingerprint: ${path}`, cause === undefined ? undefined : { cause });
    this.name = 'FingerprintReadError';
    this.path = path;
  }
}

function describe(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === undefined || v === null) return String(v);
  return typeof v;
}
