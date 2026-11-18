import { describe } from 'vitest';

/** Isolation modes: ghost-runner's `docker-box` and `static-analysis`, plus the in-memory playground. */
export type ClaimIsolationMode = 'docker-box' | 'playground' | 'static-analysis';

export type ClaimedProperty = 'P4' | 'P5' | 'P6';

export interface Claims {
  readonly p5: boolean;
  readonly p6: boolean;
}

/** P5 and P6 are never claimed for static analysis (Plan B). */
export function claimsFor(isolationMode: ClaimIsolationMode): Claims {
  const claimed = isolationMode !== 'static-analysis';
  return { p5: claimed, p6: claimed };
}

const SCOPES: Record<ClaimedProperty, string> = {
  P4: 'claimed for all worlds (pure logic)',
  P5: 'claimed only where P1 holds',
  P6: 'claimed only where network attempts are recorded',
};

/** Suite label containing the property and its declared scope. */
export function claimLabel(property: ClaimedProperty): string {
  return `${property} (${SCOPES[property]})`;
}

/** Wraps `run` in a vitest `describe` labeled with the declared scope of `property`. */
export function describeClaimed(property: ClaimedProperty, run: () => void): void {
  describe(claimLabel(property), run);
}
