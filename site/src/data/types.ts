// Types of the two generated data files (runs.json, world-size.json) and the parts matrix.

import type { WorldId } from '../config';

export type { WorldId };

/** The six Skeleton_Parts that a costume card can mark as used or not used. */
export type AppPart = 'mirror' | 'ghost' | 'wards' | 'candle' | 'blacklight' | 'graveyard';

export interface CheckRow {
  label: string;
  measured: string;
  ok: boolean;
}

/** The sampled parameters of one haunted variant (the range fields of variant-config.json). */
export interface HandVariantParams {
  drawerFrictionN: number;
  drawerMassKg: number;
  handleOffsetM: [number, number, number];
  sensorNoiseM: number;
  commandDelaySteps: number;
}

export type RealityScene =
  | { kind: 'shell'; root: 'project/'; tables: { name: string; rows: number }[]; files: string[] }
  | { kind: 'hand'; label: 'the real arm' }
  | { kind: 'cloud'; buckets: { name: string; objects: string[]; protected: boolean }[] };

export type CopyScene =
  | {
      kind: 'shell';
      tables: { name: string; rows: number; state: 'intact' | 'dropped' | 'soft'; note?: string }[];
      files: string[];
    }
  | {
      kind: 'hand';
      tiles: {
        id: string;
        label: string;
        outcome: 'passed' | 'failed';
        jointLimit: boolean;
        params: HandVariantParams;
      }[];
    }
  | { kind: 'cloud'; buckets: { name: string; objects: string[]; protected: boolean }[] };

export interface PlanRecord {
  /** Plan lines as in the plan file. */
  commands: string[];
  /** Commands joined with " && ". */
  display: string;
  verdict: 'pass' | 'warn' | 'block';
  /** Sorted. */
  violatedWardIds: string[];
  checks: CheckRow[];
  /** Destinations; empty means nothing leaves the box. */
  effectsOutside: string[];
  /** Hashes only. */
  p1: { equal: boolean; before: string; after: string };
  /** The copy after the run, reduced to the drawn items. */
  copyAfter: CopyScene;
  /** Numbers the narration uses. */
  facts: Record<string, number | string>;
  /** renderMessage text (not shown; kept for the test). */
  message: string;
}

export interface WorldRecord {
  id: WorldId;
  /** `line` is the text of the ward card kind line. */
  ward: { id: string; kind: 'sql' | 'physics' | 'path'; line: string };
  /** Drawn once in the Reality pane. */
  reality: RealityScene;
  /** The demo plan. */
  plan: PlanRecord;
  /** The fixed plan. */
  fixed: PlanRecord;
}

export interface RunsFile {
  format: 'ghost-site-runs';
  version: 1;
  seed: 42;
  variantCount: 8;
  worlds: { shell: WorldRecord; hand: WorldRecord; cloud: WorldRecord };
}

export interface WorldSizeFile {
  format: 'ghost-site-world-size';
  version: 1;
  worlds: { 'drawer-arm': number; 'ghost-cloud': number; 'playground-shell': number };
}
