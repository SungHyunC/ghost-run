// Non-vacuity statistics for the property tests.
// createCounter is copied from core/tests/pbt-stats.ts (ui cannot import core test files).

/** Counter keyed by label, e.g. verdict names `pass`, `warn`, `block`. */
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

/** Below this sample size a bucket of probability 1/10 can be missed too often to assert on. */
export const MIN_SAMPLES_FOR_BUCKETS = 100;

/**
 * Throw when a bucket expected with probability of at least 1 in 10 was never hit.
 * The check applies from 100 samples on (miss chance of one bucket at p = 0.1 is below 3e-5);
 * with fewer samples (DOM runs) it only requires that something was recorded.
 */
export function assertBucketsHit(
  counter: { counts: Record<string, number>; summary(): string },
  buckets: readonly string[],
): void {
  const total = Object.values(counter.counts).reduce((a, b) => a + b, 0);
  if (total === 0) throw new Error(`${counter.summary()} -- vacuous: no sample recorded`);
  if (total < MIN_SAMPLES_FOR_BUCKETS) return;
  const missing = buckets.filter((b) => (counter.counts[b] ?? 0) === 0);
  if (missing.length > 0) {
    throw new Error(`${counter.summary()} -- vacuous: buckets never hit: ${missing.join(', ')}`);
  }
}
