import { MIRROR_ROWS, UNRECOGNIZED_FIELDS } from './limits';
import { compact } from './escape';
import type { IconId } from './icons';
import { arrayOf, displayPrimitive, isRecord, pick } from './guards';
import type { Unreadable } from './guards';
import { formatCount } from './numbers';
import { redactGenericValue } from './redact';
import { buildSceneTree } from './scene';
import type { SceneTree } from './scene';
import {
  EMPTY_MIRROR,
  TABLE_DROPPED,
  UNRECOGNIZED_CHANGE,
  WOULD_BE_REMOVED,
  mirrorSummary,
  rowsLost,
  unreadableItem,
} from './texts';

export type RowKind =
  | 'file-created'
  | 'file-overwritten'
  | 'file-deleted'
  | 'symlink-changed'
  | 'sql-row-count'
  | 'unrecognized'
  | 'unreadable';

/** `text` is already escaped. */
export interface CellItem {
  readonly label?: string;
  readonly text: string;
}
/** Text plus icon, never color alone. */
export interface StateTag {
  readonly text: string;
  readonly icon: IconId;
}
export interface PaneCell {
  readonly state: StateTag;
  readonly items: readonly CellItem[];
}
export interface ChangeRowModel {
  /** `${stepIndex}.${index}` */
  readonly key: string;
  readonly stepIndex: number;
  readonly index: number;
  readonly kind: RowKind;
  readonly reality: PaneCell;
  readonly mirror: PaneCell;
  /** True: the view shows the Vanish_Effect and the `would be removed` label. */
  readonly vanish: boolean;
  /** `unrecognized change`, `rows lost: 1,206`, `table dropped`. */
  readonly extraLabel?: string;
  /** Additional labels in display order (rows lost, table dropped). */
  readonly extraLabels: readonly string[];
}
export interface StepModel {
  readonly stepIndex: number;
  readonly label?: string;
  readonly rows: readonly ChangeRowModel[];
  readonly unreadable: boolean;
}
export interface MirrorModel {
  readonly kind: 'ok';
  readonly steps: readonly StepModel[];
  readonly totalRows: number;
  readonly stepCount: number;
  /** `<N> changes in <M> steps` */
  readonly summary: string;
  /** Rows rendered before the reveal control: min(totalRows, MIRROR_ROWS). */
  readonly shownRows: number;
  /** Set when N = 0. */
  readonly emptyText: string | null;
  readonly scene: { readonly real: SceneTree | null; readonly mirror: SceneTree | null };
}

export { WOULD_BE_REMOVED };

const UNKNOWN_FIELDS = UNRECOGNIZED_FIELDS;

function tag(text: string, icon: IconId): StateTag {
  return { text, icon };
}

function groupDigits(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function unreadableRow(stepIndex: number, index: number): ChangeRowModel {
  return {
    key: `${stepIndex}.${index}`,
    stepIndex,
    index,
    kind: 'unreadable',
    reality: { state: tag('unreadable', 'warning'), items: [{ text: unreadableItem(index) }] },
    mirror: { state: tag('unreadable', 'warning'), items: [] },
    vanish: false,
    extraLabels: [],
  };
}

function unrecognizedRow(stepIndex: number, index: number, change: Record<string, unknown>): ChangeRowModel {
  const items: CellItem[] = [{ label: 'kind', text: displayPrimitive(change['kind'], 120) }];
  let shown = 0;
  for (const field of Object.keys(change)) {
    if (shown >= UNKNOWN_FIELDS) break;
    if (field === 'kind') continue;
    const value = change[field];
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    const node = redactGenericValue(value, field);
    items.push({ label: compact(field), text: node.kind === 'primitive' || node.kind === 'hidden' ? node.text : '' });
    shown += 1;
  }
  return {
    key: `${stepIndex}.${index}`,
    stepIndex,
    index,
    kind: 'unrecognized',
    reality: { state: tag('unrecognized', 'warning'), items },
    mirror: { state: tag(UNRECOGNIZED_CHANGE, 'warning'), items: [] },
    vanish: false,
    extraLabel: UNRECOGNIZED_CHANGE,
    extraLabels: [UNRECOGNIZED_CHANGE],
  };
}

function knownRow(stepIndex: number, index: number, change: Record<string, unknown>): ChangeRowModel | null {
  const key = `${stepIndex}.${index}`;
  const kind = change['kind'];
  const path = change['path'];
  const pathItem = (): CellItem[] => [{ label: 'path', text: compact(path as string) }];

  if (kind === 'file-created' && typeof path === 'string') {
    return {
      key, stepIndex, index, kind, vanish: false, extraLabels: [],
      reality: { state: tag('absent', 'state-absent'), items: pathItem() },
      mirror: { state: tag('created', 'state-created'), items: pathItem() },
    };
  }
  if (kind === 'file-overwritten' && typeof path === 'string') {
    return {
      key, stepIndex, index, kind, vanish: false, extraLabels: [],
      reality: { state: tag('present', 'state-present'), items: pathItem() },
      mirror: { state: tag('overwritten', 'state-overwritten'), items: pathItem() },
    };
  }
  if (kind === 'file-deleted' && typeof path === 'string') {
    return {
      key, stepIndex, index, kind, vanish: true, extraLabels: [],
      reality: { state: tag('present', 'state-present'), items: pathItem() },
      mirror: { state: tag('deleted', 'cloud'), items: pathItem() },
    };
  }
  if (kind === 'symlink-changed' && typeof path === 'string') {
    const before = change['targetBefore'];
    const after = change['targetAfter'];
    const realItems = pathItem();
    const mirrorItems = pathItem();
    if (typeof before === 'string') realItems.push({ label: 'target', text: compact(before) });
    if (typeof after === 'string') mirrorItems.push({ label: 'target', text: compact(after) });
    return {
      key, stepIndex, index, kind, vanish: false, extraLabels: [],
      reality: { state: tag('present', 'state-present'), items: realItems },
      mirror: { state: tag('link changed', 'link-changed'), items: mirrorItems },
    };
  }
  if (kind === 'sql-row-count' && typeof change['table'] === 'string') {
    const table = compact(change['table']);
    const before = change['rowsBefore'];
    const after = change['rowsAfter'];
    const extra: string[] = [];
    let vanish = false;
    if (isCount(before) && isCount(after) && before > after) {
      extra.push(rowsLost(groupDigits(BigInt(before) - BigInt(after))));
      vanish = true;
    }
    if (change['dropped'] === true) extra.push(TABLE_DROPPED);
    const row: ChangeRowModel = {
      key, stepIndex, index, kind, vanish, extraLabels: extra,
      reality: {
        state: tag('present', 'state-present'),
        items: [{ label: 'table', text: table }, { label: 'rows', text: formatCount(before) }],
      },
      mirror: {
        state: vanish ? tag('rows lost', 'cloud') : tag('row count changed', 'state-overwritten'),
        items: [{ label: 'table', text: table }, { label: 'rows', text: formatCount(after) }],
      },
    };
    return extra.length > 0 ? { ...row, extraLabel: extra[0] } : row;
  }
  return null;
}

function buildRow(stepIndex: number, index: number, element: unknown): ChangeRowModel {
  if (!isRecord(element)) return unreadableRow(stepIndex, index);
  try {
    return knownRow(stepIndex, index, element) ?? unrecognizedRow(stepIndex, index, element);
  } catch {
    // A throwing getter or proxy: the element cannot be read.
    return unreadableRow(stepIndex, index);
  }
}

function stepLabel(labels: readonly unknown[] | null, i: number): string | undefined {
  const v = labels?.[i];
  return typeof v === 'string' ? compact(v) : undefined;
}

/** input = { changes, realScene?, mirrorScene?, stepLabels? }. Total; never throws. */
export function buildMirrorModel(input: unknown): MirrorModel | Unreadable {
  const p = pick(input, 'changes', 'realScene', 'mirrorScene', 'stepLabels');
  if (p === null) return { kind: 'unreadable' };
  const steps = arrayOf(p.changes);
  if (steps === null) return { kind: 'unreadable' };
  const labels = arrayOf(p.stepLabels);

  const out: StepModel[] = [];
  let total = 0;
  steps.forEach((step, stepIndex) => {
    const label = stepLabel(labels, stepIndex);
    const elements = arrayOf(step);
    if (elements === null) {
      out.push({ stepIndex, ...(label === undefined ? {} : { label }), rows: [], unreadable: true });
      return;
    }
    const rows = elements.map((el, index) => buildRow(stepIndex, index, el));
    total += rows.length;
    out.push({ stepIndex, ...(label === undefined ? {} : { label }), rows, unreadable: false });
  });

  return {
    kind: 'ok',
    steps: out,
    totalRows: total,
    stepCount: out.length,
    summary: mirrorSummary(total, out.length),
    shownRows: Math.min(total, MIRROR_ROWS),
    emptyText: total === 0 ? EMPTY_MIRROR : null,
    scene: { real: buildSceneTree(p.realScene), mirror: buildSceneTree(p.mirrorScene) },
  };
}
