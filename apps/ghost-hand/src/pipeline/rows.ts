// Req 8.3: one row per run, `base` first, then variants in index order.
import type { GhostHandVariantResult, VariantOutcome, VariantRow } from './types';

/** Fields of a base run that a row needs (a VariantOutcome minus its index). */
export type BaseRowSource = Omit<VariantOutcome, 'index' | 'trajectoryHash' | 'firstTouch'>;

function failedOf(r: GhostHandVariantResult, maxForceN: number | undefined): boolean {
  return (
    !r.success ||
    r.forbiddenContactOccurred === true ||
    r.jointLimitExceeded === true ||
    r.selfCollisionOccurred === true ||
    (maxForceN !== undefined && (r.contactForceN ?? 0) > maxForceN)
  );
}

function rowOf(
  id: string,
  src: BaseRowSource,
  result: GhostHandVariantResult,
  maxForceN: number | undefined,
): VariantRow {
  return {
    id,
    params: src.params,
    drawerDisplacementM: src.finalDrawerM,
    maxContactForceN: src.monitors.maxContactForceN,
    touched: src.monitors.touched,
    vaseTouched: src.monitors.touched.includes('vase'),
    jointLimitExceeded: src.monitors.jointLimitExceeded,
    selfCollisionOccurred: src.monitors.selfCollisionOccurred,
    failedSteps: src.failedSteps,
    status: failedOf(result, maxForceN) ? 'failed' : 'passed',
  };
}

/**
 * `baseResult` is the Variant_Result derived from the base run (the pipeline passes it through
 * deriveVariantResult). `maxForceN` is the smallest max_contact_force_n of the physics wards, if any.
 */
export function buildRows(
  base: BaseRowSource,
  baseResult: GhostHandVariantResult,
  outcomes: readonly VariantOutcome[],
  results: readonly GhostHandVariantResult[],
  maxForceN?: number,
): VariantRow[] {
  const rows: VariantRow[] = [rowOf('base', base, baseResult, maxForceN)];
  outcomes.forEach((o, i) => {
    const r = results[i];
    if (r !== undefined) rows.push(rowOf(`variant-${o.index}`, o, r, maxForceN));
  });
  return rows;
}
