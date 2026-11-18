// Req 8.4 to 8.6: pure derivation of one Variant_Result from one variant outcome.
import { WORLD_CONFIG } from '@ghost-run/drawer-arm';
import type { Capabilities } from '../capabilities';
import type { GhostHandVariantResult, VariantOutcome } from './types';

/**
 * `caps` is accepted for the design signature; the joint-limit and self-collision fields are always set
 * (the engine reads them only after PR-1) and are never folded into `success` or the forbidden contacts.
 */
export function deriveVariantResult(
  o: VariantOutcome,
  forbidden: readonly string[],
  _caps?: Capabilities,
): GhostHandVariantResult {
  const success =
    o.engineError === undefined &&
    o.failedSteps.length === 0 &&
    o.finalDrawerM >= WORLD_CONFIG.targetOpeningM;
  return {
    variantId: `variant-${o.index}`,
    success,
    contactForceN: o.monitors.maxContactForceN,
    forbiddenContactOccurred: o.monitors.touched.some((n) => forbidden.includes(n)),
    jointLimitExceeded: o.monitors.jointLimitExceeded,
    selfCollisionOccurred: o.monitors.selfCollisionOccurred,
  };
}
