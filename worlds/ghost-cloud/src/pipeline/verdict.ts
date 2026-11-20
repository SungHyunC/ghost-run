import { VERDICT_ORDER } from '@ghost-run/core';
import type { Verdict, WardNotice, WardVerdict } from '@ghost-run/core';
import { P1_FAILED_TEXT, TRUNCATED_REASON, UNSUPPORTED_STEP_REASON } from './texts.js';

export function maxVerdict(a: Verdict, b: Verdict): Verdict {
  return VERDICT_ORDER[a] >= VERDICT_ORDER[b] ? a : b;
}

/** `block` when P1 failed, else `warn` for an unsupported step or a cut-off plan, else `pass`. */
export function verdictFloor(p1Failed: boolean, unsupportedSteps: readonly number[], truncatedLines: number): Verdict {
  if (p1Failed) return 'block';
  return unsupportedSteps.length > 0 || truncatedLines > 0 ? 'warn' : 'pass';
}

/**
 * The WardVerdict shown by the Candle. Same rule as Ghost Shell, written here on purpose:
 * the notices of the engine, then the P1 notice (only when P1 failed), then one `unsupported-step`
 * notice per unsupported step in `stepIndex` order, then the cut-off notice. The verdict is the
 * maximum of the engine verdict and the floor.
 */
export function buildShownVerdict(
  engine: WardVerdict,
  p1Failed: boolean,
  unsupportedSteps: readonly number[],
  truncatedLines: number,
  maxLines: number,
): WardVerdict {
  const added: WardNotice[] = [];
  if (p1Failed) added.push({ kind: 'observed-event', stepIndex: 0, reason: P1_FAILED_TEXT });
  for (const stepIndex of [...unsupportedSteps].sort((a, b) => a - b)) {
    added.push({ kind: 'unsupported-step', stepIndex, reason: UNSUPPORTED_STEP_REASON });
  }
  if (truncatedLines > 0) added.push({ kind: 'unsupported-step', stepIndex: maxLines, reason: TRUNCATED_REASON });
  return {
    verdict: maxVerdict(engine.verdict, verdictFloor(p1Failed, unsupportedSteps, truncatedLines)),
    violations: engine.violations,
    notices: [...engine.notices, ...added],
  };
}
