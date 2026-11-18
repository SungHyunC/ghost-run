import { compact } from './escape';
import { arrayOf, displayPrimitive, pick, type Unreadable } from './guards';
import type { IconId } from './icons';
import { UNKNOWN_VERDICT_MAX } from './limits';
import {
  CANDLE_LABELS,
  DATA_INCONSISTENT,
  NO_VIOLATIONS_REPORTED,
  noticeItem,
  noticesNeedReview,
  unreadableItem,
  violatedWard,
  violationItem,
} from './texts';

export type CandleState = 'lit' | 'flickering' | 'out' | 'unknown' | 'idle';

export type ListItem = { readonly text: string } | { readonly unreadableIndex: number };

export interface CandleModel {
  readonly kind: 'ok';
  readonly state: CandleState;
  readonly textLabel: string;
  readonly accessibleLabel: string;
  readonly icon: IconId;
  readonly unknownValueText?: string;
  readonly wardLines: readonly string[];
  readonly violationItems: readonly ListItem[];
  readonly noticeItems: readonly ListItem[];
  readonly noticeSummary?: string;
  readonly inconsistency?: string;
}

const STATE_BY_VERDICT: Readonly<Record<string, Exclude<CandleState, 'unknown' | 'idle'>>> = {
  pass: 'lit',
  warn: 'flickering',
  block: 'out',
};

const ICON_BY_STATE: Readonly<Record<CandleState, IconId>> = {
  lit: 'candle-lit',
  flickering: 'candle-flicker',
  out: 'candle-out',
  unknown: 'candle-unknown',
  idle: 'candle-idle',
};

function unknownValueText(v: unknown): string {
  if (typeof v === 'string') return compact(v, UNKNOWN_VERDICT_MAX);
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint' || v === null) {
    return compact(String(v), UNKNOWN_VERDICT_MAX);
  }
  return '[non-primitive]';
}

function field(v: unknown): string {
  return displayPrimitive(v);
}

/** Build the Candle view model. `undefined` -> idle; a non-record -> Unreadable. */
export function buildCandleModel(verdict: unknown): CandleModel | Unreadable {
  const empty = { wardLines: [], violationItems: [], noticeItems: [] } as const;
  if (verdict === undefined) {
    const l = CANDLE_LABELS.idle;
    return { kind: 'ok', state: 'idle', textLabel: l.text, accessibleLabel: l.accessible, icon: ICON_BY_STATE.idle, ...empty };
  }
  const top = pick(verdict, 'verdict', 'violations', 'notices');
  if (top === null) return { kind: 'unreadable' };

  const raw = top.verdict;
  let state: CandleState;
  if (!('verdict' in top) || raw === undefined) state = 'idle';
  else if (typeof raw === 'string' && Object.prototype.hasOwnProperty.call(STATE_BY_VERDICT, raw)) {
    state = STATE_BY_VERDICT[raw] as CandleState;
  } else state = 'unknown';

  const violations = arrayOf(top.violations) ?? [];
  const notices = arrayOf(top.notices) ?? [];

  const wardIds: string[] = [];
  const wardLines: string[] = [];
  const violationItems: ListItem[] = [];
  violations.forEach((v, index) => {
    const p = pick(v, 'wardId', 'wardKind', 'reason');
    if (p === null) {
      violationItems.push({ unreadableIndex: index });
      return;
    }
    const wardId = field(p.wardId);
    violationItems.push({ text: violationItem(wardId, field(p.reason)) });
    if (!wardIds.includes(wardId)) {
      wardIds.push(wardId);
      wardLines.push(violatedWard(wardId, field(p.wardKind)));
    }
  });
  if (state === 'out' && wardLines.length === 0) wardLines.push(NO_VIOLATIONS_REPORTED);

  // Kind-agnostic: the notice kind is never read.
  const noticeItems: ListItem[] = notices.map((n, index) => {
    const p = pick(n, 'stepIndex', 'reason');
    if (p === null) return { unreadableIndex: index };
    return { text: noticeItem(field(p.stepIndex), field(p.reason)) };
  });

  const labels = CANDLE_LABELS[state];
  const model: CandleModel = {
    kind: 'ok',
    state,
    textLabel: labels.text,
    accessibleLabel: labels.accessible,
    icon: ICON_BY_STATE[state],
    wardLines,
    violationItems,
    noticeItems,
    ...(state === 'unknown' ? { unknownValueText: unknownValueText(raw) } : {}),
    ...(state === 'flickering' ? { noticeSummary: noticesNeedReview(notices.length) } : {}),
    ...(state === 'lit' && violations.length > 0 ? { inconsistency: DATA_INCONSISTENT } : {}),
  };
  return model;
}

/** Item text for display of an unreadable slot (shared wording). */
export function listItemText(item: ListItem): string {
  return 'text' in item ? item.text : unreadableItem(item.unreadableIndex);
}
