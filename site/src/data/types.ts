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

/** One top-level entry of the Shell project. `state` is `intact` in the Reality pane. */
export interface ShellEntry {
  name: string;
  kind: 'file' | 'dir';
  state: 'intact' | 'gone' | 'new';
}

export type RealityScene =
  | {
      kind: 'shell';
      root: 'project/';
      tables: { name: string; rows: number }[];
      /** Non-hidden top-level entries of the project, without secret-pattern matches. */
      entries: ShellEntry[];
    }
  | { kind: 'hand'; label: 'the real arm' }
  | { kind: 'cloud'; buckets: { name: string; objects: string[]; protected: boolean }[] };

export type CopyScene =
  | {
      kind: 'shell';
      tables: { name: string; rows: number; state: 'intact' | 'dropped' | 'soft'; note?: string }[];
      /** The entries after the run. */
      entries: ShellEntry[];
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
  | {
      kind: 'cloud';
      /** `tag` names a changed ACL or public-access block (`acl: public-read`, `public access open`). */
      buckets: { name: string; objects: string[]; protected: boolean; tag?: string }[];
    };

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

/** How a run ends, as the walkthrough shows it. Same union as `Outcome` in `live/types.ts`. */
export type RunOutcome = 'block-fixed' | 'block-open' | 'pass' | 'warn' | 'unsupported';

export interface WorldRecord {
  id: WorldId;
  /** `line` is the text of the ward card kind line. */
  ward: { id: string; kind: 'sql' | 'physics' | 'path'; line: string };
  /** Drawn once in the Reality pane. */
  reality: RealityScene;
  /** The plan that ran first. */
  plan: PlanRecord;
  /** The fixed plan; null for Visitor_Input and when no fix exists. */
  fixed: PlanRecord | null;
  outcome: RunOutcome;
  source: 'live' | 'recorded';
  /** Set only for the outcome `unsupported`. */
  unsupported?: { reason: string; known: string[] };
}

/** One Preset of a world in runs.json version 2, in the order of Requirement 8, criterion 1. */
export interface PresetRecord {
  id: string;
  plan: PlanRecord;
  fixed: PlanRecord | null;
}

export interface WorldRecordV2 {
  id: WorldId;
  ward: WorldRecord['ward'];
  reality: RealityScene;
  presets: PresetRecord[];
}

export interface RunsFile {
  format: 'ghost-site-runs';
  version: 2;
  seed: 42;
  variantCount: 8;
  worlds: { shell: WorldRecordV2; hand: WorldRecordV2; cloud: WorldRecordV2 };
}

/** A world record as the walkthrough reads it: the Preset's plan and its Fixed_Plan (see `walk-records.ts`). */
export type WalkRecord = WorldRecord & { fixed: PlanRecord };

/** The walkthrough's view of the Runs_File: the first Preset of each world, which has a Fixed_Plan. */
export interface WalkRuns {
  seed: 42;
  variantCount: 8;
  worlds: { shell: WalkRecord; hand: WalkRecord; cloud: WalkRecord };
}

export interface WorldSizeFile {
  format: 'ghost-site-world-size';
  version: 1;
  worlds: { 'drawer-arm': number; 'ghost-cloud': number; 'playground-shell': number };
}
