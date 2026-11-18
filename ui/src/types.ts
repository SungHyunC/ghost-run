import type { ReactNode } from 'react';
import type { Change, Needle, Scene, ScanResult, ThreadLink, WardVerdict } from '@ghost-run/core';

// Theme is declared once, in the only module that declares colors.
export type { Theme } from './theme/tokens';

export type IsolationMode = 'docker-box' | 'static-analysis' | 'playground';

export type IsolationReason = 'docker-unavailable' | 'box-image-missing' | 'static-analysis' | 'unsupported-step';

/** Structural subset of the ghost-runner Isolation object (Assumption A4). */
export interface IsolationClaims {
  readonly mode: IsolationMode;
  readonly p1Claimed: boolean;
  readonly p5Claimed: boolean;
  readonly p6Claimed: boolean;
  /**
   * Why the claims are lowered. `docker-unavailable` and `box-image-missing` explain a static-analysis run;
   * `static-analysis` means no rehearsal took place; `unsupported-step` means some steps could not be rehearsed.
   */
  readonly reason?: IsolationReason;
  /**
   * Properties that do not apply to this world (for example P5 and P6 in Ghost Hand). P1 cannot be listed.
   * A listed property is neither claimed nor NOT claimed. Entries other than 'P5' and 'P6' are ignored.
   */
  readonly notApplicable?: readonly ('P5' | 'P6')[];
}

export interface BlacklightSource {
  readonly source: string;
  readonly text: string;
  readonly scan: ScanResult;
}

export interface GraveDetail {
  readonly wardVerdict?: WardVerdict;
  readonly changes?: readonly (readonly Change[])[];
  readonly claims?: IsolationClaims;
  readonly sources?: readonly BlacklightSource[];
  readonly needles?: readonly Needle[];
  readonly links?: readonly ThreadLink[];
  readonly actionLabels?: readonly string[];
}

export interface GraveEntry {
  /** /^[A-Za-z0-9_-]{1,64}$/ for a working seance link. */
  readonly id: string;
  readonly command: string;
  /** 'YYYY-MM-DDTHH:MM:SSZ' */
  readonly recordedAt: string;
  readonly wardIds: readonly string[];
  readonly detail?: GraveDetail;
}

export interface MirrorWorldProps {
  readonly changes: readonly (readonly Change[])[];
  readonly realScene?: Scene;
  readonly mirrorScene?: Scene;
  readonly stepLabels?: readonly string[];
}

export interface CandleProps {
  readonly verdict?: WardVerdict;
  readonly claims?: IsolationClaims;
}

export interface BlacklightViewProps {
  readonly sources: readonly BlacklightSource[];
}

export interface RedThreadViewProps {
  readonly needles: readonly Needle[];
  readonly links: readonly ThreadLink[];
  readonly actionLabels?: readonly string[];
}

export interface GraveyardProps {
  readonly entries: readonly GraveEntry[];
  readonly onOpenSeance: (id: string) => void;
}

export interface SeanceViewProps {
  readonly entry: GraveEntry;
  readonly onBack: () => void;
}

export interface KitRootProps {
  readonly initialTheme?: 'dark' | 'light';
  readonly children?: ReactNode;
}
