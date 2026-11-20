// Plain-data types of the walkthrough engine. No field here is read by the Reality pane.

import type { CheckRow, ShellEntry, WorldId } from '../data/types';

/** One run of narration text. `b` is bold, `code` is monospace. No HTML strings. */
export interface Segment {
  kind: 'text' | 'b' | 'code';
  text: string;
}

export type CheckRowView = CheckRow;

export type StepIndex = 0 | 1 | 2 | 3 | 4;

export type ActorAt = 'gutter' | 'copy' | 'ward' | 'verdict';

export type UsersClass = 'none' | 'poof' | 'dropped' | 'soft';

export type TileState = 'idle' | 'ok' | 'fail';

export type BucketState = 'idle' | 'poof' | 'vanish';

/** One table of the Shell copy. `bars` counts the bars that are gone, `cls` is the row class. */
export interface ShellTableState {
  name: string;
  bars: number;
  count: number;
  tag: string;
  cls: UsersClass;
}

/** One Cloud bucket of the copy. `tag` names a changed ACL or public-access block; empty when none. `objects` are the keys still in the copy. */
export interface CloudBucketState {
  name: string;
  state: BucketState;
  tag: string;
  objects: string[];
}

/** The world items of the Copy pane, by world. */
export type CopyItemState =
  | { world: 'shell'; tables: ShellTableState[]; entries: ShellEntry[] }
  | { world: 'hand'; tiles: TileState[] }
  /** Sorted by bucket name. */
  | { world: 'cloud'; buckets: CloudBucketState[] };

export interface TermState {
  visible: boolean;
  typed: string;
  caret: boolean;
}

export interface ChecksState {
  rows: CheckRowView[];
  scan: boolean;
  tone: 'none' | 'bad' | 'good';
  eoShown: boolean;
}

export type Stamp = 'none' | 'BLOCKED' | 'PASS' | 'ASK A HUMAN';

export type Candle = 'lit' | 'out' | 'flicker';

export interface WalkState {
  world: WorldId;
  /** -1 before the first step. */
  step: -1 | StepIndex;
  /** Actor class act-N; 5 = cheer. */
  act: 0 | 1 | 2 | 3 | 4 | 5;
  actorAt: ActorAt;
  copyVisible: boolean;
  /** Bumps when the copy is re-rendered (the step 5 re-copy). */
  copyEpoch: number;
  beam: boolean;
  materialize: boolean;
  plan: { text: string; rev: boolean };
  term: TermState;
  copy: CopyItemState;
  checks: ChecksState;
  candle: Candle;
  stamp: Stamp;
  note: string;
  badges: { fingerprint: boolean; go: boolean };
  narration: Segment[];
  /** How many of the last stepper steps a stopped run cannot reach (0 to 4). */
  disabledSteps: number;
}

/** What the Theater draws: the state plus the static ward and effectsOutside texts of the world. */
export interface WalkView extends WalkState {
  ward: { id: string; effectsOutside: string };
}

/** The events of the timing table, one per mockup mutation. */
export type WalkEvent =
  | { type: 'enter'; step: StepIndex; act: WalkState['act']; actorAt: ActorAt; narration: Segment[] }
  | { type: 'beam'; on: boolean }
  | { type: 'copyShow'; materialize: boolean }
  | { type: 'recopy'; copy: CopyItemState }
  | { type: 'plan'; text: string; rev: boolean }
  | { type: 'termShow' }
  | { type: 'termType'; typed: string }
  | { type: 'termHide' }
  | { type: 'checksClear'; scan: boolean }
  | { type: 'checkRow'; row: CheckRowView }
  | { type: 'wardTone'; tone: 'bad' | 'good' }
  | { type: 'candle'; state: Candle }
  | { type: 'stamp'; stamp: Stamp }
  | { type: 'note'; text: string }
  | { type: 'badges'; fingerprint: boolean; go: boolean }
  | { type: 'act'; act: WalkState['act'] }
  | { type: 'table'; name: string; bars?: number; count?: number; tag?: string; cls?: UsersClass }
  | { type: 'entry'; name: string; kind: ShellEntry['kind']; state: ShellEntry['state'] }
  | { type: 'bucketTag'; name: string; tag: string }
  | { type: 'bucketObjects'; name: string; objects: string[] }
  | { type: 'disable'; count: number }
  | { type: 'handTile'; index: number; state: Exclude<TileState, 'idle'> }
  | { type: 'cloudBucket'; name: string; state: Exclude<BucketState, 'idle'> };

/** An event with its offset in ms after the start of its step. */
export interface TimedEvent {
  at: number;
  event: WalkEvent;
}
