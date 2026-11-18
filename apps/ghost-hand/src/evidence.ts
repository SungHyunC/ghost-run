// Gate for the claim flags (design D22): built by the app shell from the Determinism_Self_Check and
// the capability probes. The pipeline never reads a global.
import type { Capabilities } from './capabilities';

// Shape from design.md "Self-check". Move to self-check.ts when that task lands and re-export from there.
export type SelfCheckResult =
  | { readonly state: 'pending' }
  | { readonly state: 'ok'; readonly hash: string; readonly restoreOk: true }
  | {
      readonly state: 'failed';
      readonly reason: 'not-reproduced' | 'restore-mismatch' | 'engine-error' | 'no-secure-context';
      readonly hash?: string;
    };

export interface ClaimEvidence {
  readonly selfCheck: SelfCheckResult;
  readonly capabilities: Capabilities;
}
