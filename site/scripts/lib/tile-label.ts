import { BASE_VARIANT_PARAMS } from '@ghost-run/drawer-arm';

/** The fields of a sampled variant that the label rule reads. */
export interface TileLabelParams {
  readonly drawerFrictionN: number;
  readonly drawerMassKg: number;
  readonly handleOffsetM: readonly [number, number, number];
  readonly commandDelaySteps: number;
}

// Fixed scoring constants (max values of variant-config.json, rounded for scoring).
const HANDLE_SCALE_MM = 10;
const DELAY_SCALE_STEPS = 6;

const MULTIPLY = '\u00D7';

/**
 * One short label per haunted variant: the candidate with the highest score wins,
 * and a tie goes to the earlier candidate (friction, mass, handle, delay).
 */
export function tileLabel(params: TileLabelParams): string {
  const base = BASE_VARIANT_PARAMS;
  const frictionRatio = params.drawerFrictionN / base.drawerFrictionN;
  const massRatio = params.drawerMassKg / base.drawerMassKg;
  const [hx, hy, hz] = params.handleOffsetM;
  const handleMm = Math.hypot(hx, hy, hz) * 1000;

  const candidates: Array<{ score: number; text: string }> = [
    { score: Math.abs(Math.log(frictionRatio)), text: `friction ${MULTIPLY}${frictionRatio.toFixed(2)}` },
    { score: Math.abs(Math.log(massRatio)), text: `mass ${MULTIPLY}${massRatio.toFixed(2)}` },
    { score: handleMm / HANDLE_SCALE_MM, text: `handle ${handleMm.toFixed(1)} mm` },
    { score: params.commandDelaySteps / DELAY_SCALE_STEPS, text: `delay ${params.commandDelaySteps} steps` },
  ];

  let best = candidates[0];
  for (const c of candidates) {
    if (best === undefined || c.score > best.score) best = c;
  }
  return best?.text ?? '';
}
