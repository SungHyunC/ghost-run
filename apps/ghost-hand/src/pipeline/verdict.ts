// Req 10.2, 10.3: the P1 floor. Different fingerprints always give `block`.
import type { WardVerdict } from '@ghost-run/core';

export function applyVerdictFloor(v: WardVerdict, p1Equal: boolean): WardVerdict {
  if (p1Equal) return v;
  return {
    verdict: 'block',
    violations: [
      ...v.violations,
      { wardId: 'isolation-check', wardKind: 'physics', reason: 'fingerprint changed during the ghost run' },
    ],
    notices: v.notices,
  };
}
