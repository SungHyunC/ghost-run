import { THREADS } from './limits';
import { compact, detail } from './escape';
import { arrayOf, pick } from './guards';
import type { Unreadable } from './guards';
import {
  EMPTY_THREAD,
  THREAD_LITERAL_ONLY,
  THREAD_NOT_FOUND,
  threadMismatch,
  unreadableItem,
} from './texts';

export interface ThreadAction {
  /** `step <stepIndex>` */
  readonly stepText: string;
  readonly origin: string;
  /** Escaped. */
  readonly value: string;
  readonly actionLabel?: string;
}

export interface ThreadCause {
  readonly source: string;
  readonly kind: string;
  /** `line:column` */
  readonly position: string;
  readonly lineText: string;
  readonly matchedHost: boolean;
  readonly hidden: boolean;
}

export interface ThreadModel {
  readonly index: number;
  /** 'Red thread: <value> at step <n> to <source> line <l> column <c>' | '... , no cause found' | 'Unreadable item <i>' */
  readonly accessibleName: string;
  /** Null only for an unreadable slot. */
  readonly action: ThreadAction | null;
  /** Set only for a well-formed `found` link; the view draws the red line exactly when this is set. */
  readonly cause: ThreadCause | null;
  readonly notFoundText: string | null;
  /** The pair could not be read; the view shows `accessibleName` ("Unreadable item <index>"). */
  readonly unreadable: boolean;
}

export interface RedThreadModel {
  readonly kind: 'ok';
  /** All pairs (min of both lengths); the view renders the first `shownThreads`. */
  readonly threads: readonly ThreadModel[];
  readonly totalThreads: number;
  /** min(totalThreads, THREADS) */
  readonly shownThreads: number;
  readonly mismatch: string | null;
  readonly emptyText: string | null;
  /** Fixed sentence, shown once per view. */
  readonly literalOnlyText: string;
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function unreadableSlot(index: number): ThreadModel {
  return {
    index,
    accessibleName: unreadableItem(index),
    action: null,
    cause: null,
    notFoundText: null,
    unreadable: true,
  };
}

function buildThread(index: number, needle: unknown, link: unknown, labels: readonly unknown[] | null): ThreadModel {
  const n = pick(needle, 'value', 'origin', 'stepIndex');
  const l = pick(link, 'status', 'matchedKey', 'source', 'kind', 'line', 'column', 'lineText', 'hidden');
  if (n === null || l === null) return unreadableSlot(index);
  if (typeof n.value !== 'string' || typeof n.origin !== 'string' || !isCount(n.stepIndex)) {
    return unreadableSlot(index);
  }
  const value = compact(n.value);
  const stepIndex = n.stepIndex;
  const rawLabel = labels === null ? undefined : labels[stepIndex];
  const actionLabel = typeof rawLabel === 'string' ? compact(rawLabel) : undefined;
  const action: ThreadAction = {
    stepText: `step ${stepIndex}`,
    origin: compact(n.origin),
    value,
    ...(actionLabel === undefined ? {} : { actionLabel }),
  };

  if (l.status === 'not-found') {
    return {
      index,
      accessibleName: `Red thread: ${value} at step ${stepIndex}, no cause found`,
      action,
      cause: null,
      notFoundText: THREAD_NOT_FOUND,
      unreadable: false,
    };
  }
  if (
    l.status === 'found' &&
    (l.matchedKey === 'value' || l.matchedKey === 'host') &&
    typeof l.source === 'string' &&
    typeof l.kind === 'string' &&
    isCount(l.line) &&
    isCount(l.column) &&
    typeof l.lineText === 'string' &&
    typeof l.hidden === 'boolean'
  ) {
    const source = compact(l.source);
    const cause: ThreadCause = {
      source,
      kind: compact(l.kind),
      position: `${l.line}:${l.column}`,
      lineText: detail(l.lineText),
      matchedHost: l.matchedKey === 'host',
      hidden: l.hidden,
    };
    return {
      index,
      accessibleName: `Red thread: ${value} at step ${stepIndex} to ${source} line ${l.line} column ${l.column}`,
      action,
      cause,
      notFoundText: null,
      unreadable: false,
    };
  }
  return unreadableSlot(index);
}

/**
 * input = { needles, links, actionLabels? }. Pairs needles[i] with links[i] by index only, up to the
 * shorter length. `links[i].needle` is never read. Total; never throws.
 */
export function buildRedThreadModel(input: unknown): RedThreadModel | Unreadable {
  const p = pick(input, 'needles', 'links', 'actionLabels');
  if (p === null) return { kind: 'unreadable' };
  const needles = arrayOf(p.needles);
  const links = arrayOf(p.links);
  if (needles === null || links === null) return { kind: 'unreadable' };
  const labels = arrayOf(p.actionLabels);

  const pairs = Math.min(needles.length, links.length);
  const threads: ThreadModel[] = [];
  for (let i = 0; i < pairs; i += 1) threads.push(buildThread(i, needles[i], links[i], labels));

  return {
    kind: 'ok',
    threads,
    totalThreads: pairs,
    shownThreads: Math.min(pairs, THREADS),
    mismatch: needles.length === links.length ? null : threadMismatch(needles.length, links.length),
    emptyText: needles.length === 0 ? EMPTY_THREAD : null,
    literalOnlyText: THREAD_LITERAL_ONLY,
  };
}
