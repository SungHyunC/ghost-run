import { arrayOf, pick } from './guards';
import type { Unreadable } from './guards';
import { compact, detail } from './escape';
import { notRecorded } from './texts';

export interface SeanceModel {
  readonly kind: 'ok';
  /** Detail limit, newlines kept. */
  readonly command: string;
  /** Escaped as supplied. */
  readonly recordedAt: string;
  readonly wardIds: readonly string[];
  /** '<part> not recorded' for each absent part, in the order wardVerdict, claims, changes, sources, needles, links. */
  readonly notRecorded: readonly string[];
  /** Which sections the view draws. */
  readonly parts: {
    readonly verdict: boolean;
    readonly changes: boolean;
    readonly sources: boolean;
    readonly thread: boolean;
  };
}

/** A part is recorded when the property is present and not `undefined`. A wrong type is still "present". */
export function buildSeanceModel(entry: unknown): SeanceModel | Unreadable {
  const e = pick(entry, 'command', 'recordedAt', 'wardIds', 'detail');
  if (e === null) return { kind: 'unreadable' };
  const wards = arrayOf(e.wardIds);
  if (
    typeof e.command !== 'string' ||
    typeof e.recordedAt !== 'string' ||
    wards === null ||
    !wards.every((w) => typeof w === 'string')
  ) {
    return { kind: 'unreadable' };
  }
  const d =
    e.detail === undefined
      ? {}
      : pick(e.detail, 'wardVerdict', 'claims', 'changes', 'sources', 'needles', 'links');
  const has = (k: 'wardVerdict' | 'claims' | 'changes' | 'sources' | 'needles' | 'links'): boolean =>
    d !== null && (d as Record<string, unknown>)[k] !== undefined;
  const missing = (['wardVerdict', 'claims', 'changes', 'sources', 'needles', 'links'] as const)
    .filter((k) => !has(k))
    .map(notRecorded);
  return {
    kind: 'ok',
    command: detail(e.command),
    recordedAt: compact(e.recordedAt),
    wardIds: (wards as readonly string[]).map((w) => compact(w)),
    notRecorded: missing,
    parts: {
      verdict: has('wardVerdict') || has('claims'),
      changes: has('changes'),
      sources: has('sources'),
      thread: has('needles') && has('links'),
    },
  };
}
