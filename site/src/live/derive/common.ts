// Pure helpers shared by derive/shell.ts, derive/cloud.ts, derive/hand.ts, and the record script.
// Structural input types only: no engine import, no I/O.

import type { CheckRow } from '../../data/types';
import { echo } from '../input';

export interface ViolationLike {
  readonly wardId: string;
  readonly reason: string;
}

export interface EffectLike {
  readonly destination: string;
}

export interface ObservedEventLike {
  readonly kind: string;
  readonly destination?: string;
}

/** The extra chip of a violated ward other than the headline ward. */
export interface ExtraChip {
  wardId: string;
  text: string;
}

/** One check row. */
export function checkRow(label: string, measured: string, ok: boolean): CheckRow {
  return { label, measured, ok };
}

/** A row for a limit that the measured value must not exceed: label `<name>, at most <limit>`. */
export function atMostRow(name: string, limit: number, actual: number, measured: string = String(actual)): CheckRow {
  return checkRow(`${name}, at most ${limit}`, measured, actual <= limit);
}

/** Ward ids that have a violation: sorted, unique. */
export function violatedIds(violations: readonly ViolationLike[]): string[] {
  return [...new Set(violations.map((v) => v.wardId))].sort();
}

/** Destinations of effects outside the copy and of network attempts: sorted, unique. */
export function destinations(
  effects: readonly (readonly EffectLike[])[],
  events: readonly ObservedEventLike[],
): string[] {
  const out = new Set<string>();
  for (const step of effects) for (const e of step) out.add(e.destination);
  for (const ev of events) {
    if (ev.kind === 'network-attempt' && ev.destination !== undefined) out.add(ev.destination);
  }
  return [...out].sort();
}

/**
 * The chip for the first violated ward (by id order) that is not the headline ward, or null.
 * The text is the engine's reason, escaped and cut by `echo`.
 */
export function extraChip(violations: readonly ViolationLike[], headlineWardId: string): ExtraChip | null {
  const others = violations.filter((v) => v.wardId !== headlineWardId);
  if (others.length === 0) return null;
  const first = [...others].sort((a, b) => (a.wardId < b.wardId ? -1 : a.wardId > b.wardId ? 1 : 0))[0] as ViolationLike;
  return { wardId: first.wardId, text: echo(first.reason) };
}

/** The violations of one ward. A chip is a cross exactly when this list is not empty. */
export function violationsOf(violations: readonly ViolationLike[], wardId: string): ViolationLike[] {
  return violations.filter((v) => v.wardId === wardId);
}

/** The reason of the first violation of a ward (as the engine wrote it, escaped and cut by `echo`), or null. */
export function reasonOf(violations: readonly ViolationLike[], wardId: string): string | null {
  const first = violationsOf(violations, wardId)[0];
  return first === undefined ? null : echo(first.reason);
}

/** One chip for each violated ward other than the headline ward, in ward id order. The text is the engine's reason. */
export function extraChips(violations: readonly ViolationLike[], headlineWardId: string): ExtraChip[] {
  const ids = violatedIds(violations).filter((id) => id !== headlineWardId);
  return ids.flatMap((wardId) => {
    const text = reasonOf(violations, wardId);
    return text === null ? [] : [{ wardId, text }];
  });
}
