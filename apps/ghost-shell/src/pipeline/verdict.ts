import { VERDICT_ORDER } from '@ghost-run/core';
import type { Verdict, WardNotice, WardVerdict } from '@ghost-run/core';
import { UNSUPPORTED_STEP_REASON, WATCHDOG_STEP_REASON } from '../texts';

export interface FloorStep {
  readonly stepIndex: number;
  readonly unsupported: boolean;
  readonly watchdog: boolean;
}

export function maxVerdict(a: Verdict, b: Verdict): Verdict {
  return VERDICT_ORDER[a] >= VERDICT_ORDER[b] ? a : b;
}

/** `block` for a failed P1 check, else `warn` for an unsupported or watchdog step, else `pass`. */
export function verdictFloor(p1Failed: boolean, steps: readonly FloorStep[]): Verdict {
  if (p1Failed) return 'block';
  return steps.some((s) => s.unsupported || s.watchdog) ? 'warn' : 'pass';
}

/**
 * The WardVerdict shown by the Candle: the engine's violations and notices, then one `unsupported-step`
 * notice per unsupported step and one per watchdog step in `stepIndex` order. The verdict is the maximum
 * of the engine verdict and the floor.
 */
export function buildShownVerdict(
  engine: WardVerdict,
  p1Failed: boolean,
  steps: readonly FloorStep[],
): WardVerdict {
  const added: WardNotice[] = [];
  const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
  for (const s of ordered) {
    if (s.unsupported) added.push({ kind: 'unsupported-step', stepIndex: s.stepIndex, reason: UNSUPPORTED_STEP_REASON });
    if (s.watchdog) added.push({ kind: 'unsupported-step', stepIndex: s.stepIndex, reason: WATCHDOG_STEP_REASON });
  }
  return {
    verdict: maxVerdict(engine.verdict, verdictFloor(p1Failed, steps)),
    violations: engine.violations,
    notices: [...engine.notices, ...added],
  };
}
