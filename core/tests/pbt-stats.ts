// Shared non-vacuity statistics for the property tests.
// Plain counters (fast-check's fc.statistics only prints and cannot be asserted on).

export const PLAN_LENGTH_BUCKETS = ['1', '2-5', '6-10', '11-25', '26-50'] as const;
export type PlanLengthBucket = (typeof PLAN_LENGTH_BUCKETS)[number];

export function lengthBucket(length: number): PlanLengthBucket {
  if (length <= 1) return '1';
  if (length <= 5) return '2-5';
  if (length <= 10) return '6-10';
  if (length <= 25) return '11-25';
  return '26-50';
}

/** Structural equality for JSON-like values. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  return (
    ak.length === Object.keys(bo).length &&
    ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]))
  );
}

export interface PlanStats {
  /** Record one sample: plan length and whether the run changed the state. */
  record(planLength: number, changed: boolean): void;
  readonly runs: number;
  readonly changed: number;
  readonly unchanged: number;
  readonly lengths: Record<PlanLengthBucket, number>;
  /** Summary line, e.g. `P1 stats: runs=100 changed=80 unchanged=20 lengths={...}`. */
  summary(): string;
  /** Print the summary to test output and return it. */
  print(): string;
  /** Throw if the property was vacuous: no state change, or a single length bucket. */
  assertNonVacuous(): void;
}

export function createPlanStats(label: string): PlanStats {
  const lengths: Record<PlanLengthBucket, number> = {
    '1': 0,
    '2-5': 0,
    '6-10': 0,
    '11-25': 0,
    '26-50': 0,
  };
  let runs = 0;
  let changed = 0;
  const self: PlanStats = {
    record(planLength, didChange) {
      runs++;
      if (didChange) changed++;
      lengths[lengthBucket(planLength)]++;
    },
    get runs() {
      return runs;
    },
    get changed() {
      return changed;
    },
    get unchanged() {
      return runs - changed;
    },
    lengths,
    summary() {
      return `${label} stats: runs=${runs} changed=${changed} unchanged=${runs - changed} lengths=${JSON.stringify(lengths)}`;
    },
    print() {
      const line = self.summary();
      console.log(line);
      return line;
    },
    assertNonVacuous() {
      if (changed === 0) throw new Error(`${self.summary()} -- vacuous: no sample changed state`);
      const used = PLAN_LENGTH_BUCKETS.filter((b) => lengths[b] > 0).length;
      if (used < 2) throw new Error(`${self.summary()} -- vacuous: plan lengths span one bucket`);
    },
  };
  return self;
}

/** Counter keyed by label, e.g. verdict pairs `pass->warn`. */
export function createCounter(label: string): {
  add(key: string): void;
  counts: Record<string, number>;
  summary(): string;
  print(): string;
} {
  const counts: Record<string, number> = {};
  return {
    add(key) {
      counts[key] = (counts[key] ?? 0) + 1;
    },
    counts,
    summary() {
      return `${label} stats: ${JSON.stringify(counts)}`;
    },
    print() {
      const line = this.summary();
      console.log(line);
      return line;
    },
  };
}
