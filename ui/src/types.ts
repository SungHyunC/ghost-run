import type { ReactNode } from 'react';
import type { Change, Needle, Scene, ScanResult, ThreadLink, WardVerdict } from '@ghost-run/core';

// Theme is declared once, in the only module that declares colors.
export type { Theme } from './theme/tokens';

export type IsolationMode = 'docker-box' | 'static-analysis' | 'playground';

/** Structural subset of the ghost-runner Isolation object (Assumption A4). */
export interface IsolationClaims {
  readonly mode: IsolationMode;
  readonly p1Claimed: boolean;
  readonly p5Claimed: boolean;
  readonly p6Claimed: boolean;
  readonly reason?: 'docker-unavailable' | 'box-image-missing';
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
