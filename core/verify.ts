import * as fc from 'fast-check';
import { VERDICT_ORDER, WardEngine, ghostRun, isMoreRestrictive } from './src/index.js';
import type { Change, Snapshot, Ward, WardSet, World } from './src/index.js';

/** Default number of generated examples per property (short run). */
const DEFAULT_NUM_RUNS = 100;
const MAX_PLAN_LENGTH = 50;

/** Test-only adapter that executes actions against a live (non-copied) world for P2. */
export interface DeterministicTestAdapter<S, A> {
  apply(state: S, actions: readonly A[]): Change[];
}

export interface VerifyWorldOptions<S, A> {
  id: string;
  deterministic: boolean;
  wardSet: WardSet;
  /** Required when `deterministic: true`. */
  testAdapter?: DeterministicTestAdapter<S, A>;
  /** Defaults to 100. */
  numRuns?: number;
  /**
   * Generator for valid actions. Not listed in design.md, but a generic
   * verifier cannot produce plans without it.
   */
  actionArb: fc.Arbitrary<A>;
  /**
   * Decides whether two world states are the same. Used by P3 criteria 10.1
   * (immutability) and 10.2 (replay determinism). Defaults to a structural
   * field-by-field comparison. Supply it for worlds whose state carries
   * per-step noise (copy paths, timestamps) that no replay can reproduce.
   * Change lists (P2) and verdicts (ward checks) always use the structural
   * comparison.
   */
  stateEquals?: (a: S, b: S) => boolean;
}

export class VerificationError extends Error {
  constructor(
    public readonly propertyId: string,
    public readonly criterionId: string,
    public readonly counterexample: unknown,
  ) {
    super(`Verification failed: ${propertyId} (${criterionId})`);
    this.name = 'VerificationError';
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  return (
    ak.length === bk.length &&
    ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]))
  );
}

/** Run an async property with fc.check; throw VerificationError on the first failure. */
async function check<A>(
  propertyId: string,
  criterionId: string,
  numRuns: number,
  plans: fc.Arbitrary<A[]>,
  predicate: (actions: A[]) => Promise<boolean>,
): Promise<void> {
  const details = await fc.check(fc.asyncProperty(plans, predicate), { numRuns });
  if (details.failed) {
    const counterexample =
      details.counterexample !== null ? details.counterexample[0] : details.errorInstance;
    throw new VerificationError(propertyId, criterionId, counterexample);
  }
}

function singleWardSet(ward: Ward): WardSet {
  return { wards: [ward] };
}

/**
 * Registration gate. Runs P3, P1, P2 (only if deterministic), then per-ward
 * properties. Throws VerificationError on the first failure.
 */
export async function verifyWorld<S, A>(
  world: World<S, A>,
  options: VerifyWorldOptions<S, A>,
): Promise<void> {
  const numRuns = options.numRuns ?? DEFAULT_NUM_RUNS;
  const stateEquals = options.stateEquals ?? deepEqual;
  const plans = fc.array(options.actionArb, { minLength: 1, maxLength: MAX_PLAN_LENGTH });

  // P3: immutability (10.1) and replay determinism (10.2).
  await check('P3', '10.1', numRuns, plans, async (actions) => {
    const s = await world.snapshot();
    const before = structuredClone(s.state);
    await ghostRun(world, s, actions);
    return stateEquals(s.state, before);
  });
  await check('P3', '10.2', numRuns, plans, async (actions) => {
    const s = await world.snapshot();
    const r1 = await ghostRun(world, s, actions);
    const r2 = await ghostRun(world, s, actions);
    const last1 = r1.snapshots[r1.snapshots.length - 1];
    const last2 = r2.snapshots[r2.snapshots.length - 1];
    return last1 !== undefined && last2 !== undefined && stateEquals(last1.state, last2.state);
  });

  // P1: reality fingerprint unchanged by a ghost run (8.1).
  await check('P1', '8.1', numRuns, plans, async (actions) => {
    const fpBefore = await world.fingerprint();
    const s = await world.snapshot();
    await ghostRun(world, s, actions);
    const fpAfter = await world.fingerprint();
    return fpBefore.hash === fpAfter.hash;
  });

  // P2: ghost diff equals real diff (9.1), deterministic worlds only.
  if (options.deterministic) {
    const adapter = options.testAdapter;
    if (adapter === undefined) {
      throw new Error(`verifyWorld(${options.id}): testAdapter is required when deterministic is true`);
    }
    await check('P2', '9.1', numRuns, plans, async (actions) => {
      const s: Snapshot<S> = await world.snapshot();
      const report = await ghostRun(world, s, actions);
      const ghostChanges = report.changes.flat();
      const realChanges = adapter.apply(structuredClone(s.state), actions);
      return deepEqual(ghostChanges, realChanges);
    });
  }

  // Ward properties (11.1): deterministic evaluation, valid ward ids, and
  // monotonicity of the full set relative to each single-ward subset.
  for (const ward of options.wardSet.wards) {
    const single = singleWardSet(ward);
    await check(`ward:${ward.id}`, '11.1', numRuns, plans, async (actions) => {
      const s = await world.snapshot();
      const report = await ghostRun(world, s, actions);
      const v1 = WardEngine.evaluate(report, single);
      const v2 = WardEngine.evaluate(report, single);
      if (!deepEqual(v1, v2)) return false;
      if (!v1.violations.every((v) => v.wardId === ward.id)) return false;
      if (isMoreRestrictive(single, options.wardSet)) {
        const full = WardEngine.evaluate(report, options.wardSet);
        return VERDICT_ORDER[full.verdict] >= VERDICT_ORDER[v1.verdict];
      }
      return true;
    });
  }
}
