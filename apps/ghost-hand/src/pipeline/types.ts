// Pipeline types (design "Pipeline"). Pure type module: no imports of three or React.
import type {
  Change,
  Needle,
  ThreadLink,
  Verdict,
  VariantResult,
  WardSet,
  WardVerdict,
} from '@ghost-run/core';
import type { IsolationClaims } from '@ghost-run/ui';
import type {
  GhostHandAction,
  GhostHandWorld,
  VariantConfig,
  VariantOutcome,
  VariantParams,
} from '@ghost-run/drawer-arm';
import type { VariantExecutor } from '../exec/executor';
import type { ClaimEvidence } from '../evidence';

/** The real outcome type of the world package (type-only import: the pipeline stays engine-free at runtime). */
export type { VariantOutcome };

/** An extra optional field is structurally assignable, so this compiles before and after PR-1. */
export type GhostHandVariantResult = VariantResult & {
  readonly jointLimitExceeded?: boolean;
  readonly selfCollisionOccurred?: boolean;
};

export interface VariantRow {
  readonly id: string; // 'base' or 'variant-<index>'
  readonly params: VariantParams;
  readonly drawerDisplacementM: number;
  readonly maxContactForceN: number;
  readonly touched: readonly string[];
  readonly vaseTouched: boolean;
  readonly jointLimitExceeded: boolean;
  readonly selfCollisionOccurred: boolean;
  readonly failedSteps: readonly number[];
  readonly status: 'passed' | 'failed';
}

export interface OverlayInput {
  readonly variants: readonly { id: string; result: GhostHandVariantResult; frames: Float32Array }[];
  readonly base: { frames: Float32Array };
  readonly bodyCount: number;
  readonly framesPerSecond: number;
}

export interface GhostRun {
  readonly engineVerdict: WardVerdict;
  readonly wardVerdict: WardVerdict; // engine verdict with the P1 floor applied
  readonly verdict: Verdict;
  readonly message: string;
  readonly claims: IsolationClaims;
  readonly p1: { readonly before: string; readonly after: string; readonly equal: boolean };
  readonly rows: readonly VariantRow[]; // base first, then variants in index order
  readonly variantResults: readonly GhostHandVariantResult[];
  readonly baseChanges: readonly Change[];
  readonly overlay: OverlayInput;
  readonly notices: readonly string[];
  readonly unknownContactNames: readonly string[];
  readonly needles: readonly Needle[];
  readonly links: readonly ThreadLink[];
}

export interface RunInput {
  readonly plan: readonly GhostHandAction[];
  readonly wardSet: WardSet;
  readonly variantConfig: VariantConfig;
  readonly seed: number;
  readonly variantCount: number;
  /** The reference world (recordFrames on). */
  readonly world: GhostHandWorld;
  readonly executor: VariantExecutor;
  readonly evidence: ClaimEvidence;
  readonly planOrigin?: 'recorded' | 'scripted';
}
