import type { PlaygroundAction } from '@ghost-run/playground-shell';
import type { Needle, ThreadLink } from '@ghost-run/core';
import type { Playground_Run } from '../pipeline/run-playground';
import type { BlacklightSource, GraveDetail, GraveEntry } from '../ui-imports';

/** Maximum number of Grave_Entry values kept (design, Data Models: GRAVEYARD_MAX). */
export const GRAVEYARD_MAX = 200;

export interface GraveyardState {
  readonly entries: readonly GraveEntry[];
  readonly nextId: number;
  readonly dropped: boolean;
}

export interface PossessionDetail {
  readonly sources: readonly BlacklightSource[];
  readonly needles: readonly Needle[];
  readonly links: readonly ThreadLink[];
}

export type GraveyardEvent = {
  readonly type: 'add';
  readonly run: Playground_Run;
  readonly plan: readonly PlaygroundAction[];
  /** Injected by the shell from its clock, formatted YYYY-MM-DDTHH:MM:SSZ. */
  readonly recordedAt: string;
  readonly possession?: PossessionDetail;
  /**
   * Where the run came from. Only an explicit user action records a tombstone;
   * an omitted origin means explicit. Edit-caused re-runs and Purify never add.
   */
  readonly origin?: 'explicit' | 'edit' | 'purify';
};

export const initialGraveyardState: GraveyardState = { entries: [], nextId: 1, dropped: false };

export function graveyardReducer(s: GraveyardState, e: GraveyardEvent): GraveyardState {
  if (e.type !== 'add') return s;
  if (e.origin !== undefined && e.origin !== 'explicit') return s;
  if (e.run.verdict !== 'block') return s;

  const wardIds: string[] = [];
  for (const v of e.run.wardVerdict.violations) {
    if (!wardIds.includes(v.wardId)) wardIds.push(v.wardId);
  }

  const detail: GraveDetail = {
    wardVerdict: e.run.wardVerdict,
    changes: e.run.report.changes,
    claims: e.run.claims,
    actionLabels: e.plan.map((a) => a.command),
    ...(e.possession
      ? { sources: e.possession.sources, needles: e.possession.needles, links: e.possession.links }
      : {}),
  };

  const entry: GraveEntry = {
    id: `g-${s.nextId}`,
    command: e.plan.map((a) => a.command).join('; '),
    recordedAt: e.recordedAt,
    wardIds,
    detail,
  };

  const all = [...s.entries, entry];
  const overflow = all.length > GRAVEYARD_MAX;
  return {
    entries: overflow ? all.slice(all.length - GRAVEYARD_MAX) : all,
    nextId: s.nextId + 1,
    dropped: s.dropped || overflow,
  };
}
