// Run-time budget of the contract tests (design.md, "PBT configuration").
// The Short_Run guard is 45,000 ms; the hook limit is 60,000 ms. Nightly runs have no limit.

import { PBT_MODE } from '../pbt-config.js';

export const SHORT_RUN_GUARD_MS = 45_000;
export const SAVE_TIME_BUDGET_MS = 60_000;

export interface Budget {
  /** Run `fn`, record its elapsed time, and return the result. */
  measure<T>(label: string, fn: () => Promise<T>): Promise<T>;
  /** Elapsed milliseconds per label, in recording order. */
  readonly records: ReadonlyMap<string, number>;
  /** Sum of all recorded labels. */
  total(): number;
  /** Throws when the total exceeds the guard (Short_Run only). */
  assertWithinGuard(): void;
}

export function createBudget(guardMs: number = SHORT_RUN_GUARD_MS): Budget {
  const records = new Map<string, number>();
  return {
    records,
    async measure(label, fn) {
      const start = performance.now();
      try {
        return await fn();
      } finally {
        records.set(label, (records.get(label) ?? 0) + (performance.now() - start));
      }
    },
    total() {
      let sum = 0;
      for (const v of records.values()) sum += v;
      return sum;
    },
    assertWithinGuard() {
      if (PBT_MODE !== 'short') return;
      const total = this.total();
      if (total > guardMs) {
        throw new Error(`contract tests took ${Math.round(total)} ms, above the ${guardMs} ms Short_Run guard`);
      }
    },
  };
}
