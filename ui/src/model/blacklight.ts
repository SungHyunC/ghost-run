import { BL_FINDINGS, BL_LINES, MARKER_CODEPOINTS, MARKER_RENDERING } from './limits';
import { compact, detail, escapeForDisplay, formatHex } from './escape';
import { arrayOf, displayPrimitive, pick } from './guards';
import type { Unreadable } from './guards';
import { EMPTY_BLACKLIGHT, FINDINGS_LOCKED, NO_FINDINGS, codePointCountText, blacklightSummary, showing, unreadableItem } from './texts';

export type HiddenCategory = 'tag' | 'zero-width' | 'bidi' | 'html-comment';

export const HIDDEN_CATEGORIES: readonly HiddenCategory[] = ['tag', 'zero-width', 'bidi', 'html-comment'];

export interface MarkerModel {
  readonly findingIndex: number;
  readonly category: string;
  /** 'line:column' exactly as supplied by the Finding. */
  readonly position: string;
  /** Number of valid code points of the Finding; shown in both states. */
  readonly codePointCount: string;
  /** Hex_Notation list; empty while the blacklight is off. */
  readonly hex: readonly string[];
  readonly moreCount: number;
  /** Expanded text of the Finding; empty while the blacklight is off. */
  readonly rendering: string;
}

export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'marker'; readonly marker: MarkerModel };

export interface LineModel {
  readonly number: number;
  readonly segments: readonly Segment[];
}

/** Which limited lists the user revealed, by source index. */
export interface BlacklightReveal {
  readonly lines: ReadonlySet<number>;
  readonly findings: ReadonlySet<number>;
}

/** Display fields of a Finding that could not be placed (all escaped). */
export interface FindingFields {
  readonly findingIndex: number;
  readonly category: string;
  readonly position: string;
  readonly offset: string;
  readonly length: string;
  readonly codePointCount: string;
  readonly hex: readonly string[];
  readonly moreCount: number;
  readonly rendering: string;
}

export interface SourceModel {
  readonly label: string;
  readonly summary: string;
  readonly categoryCounts: readonly { readonly category: HiddenCategory; readonly count: number }[];
  readonly lines: readonly LineModel[];
  readonly totalLines: number;
  readonly linesNotice: string | null;
  readonly totalFindings: number;
  readonly entries: readonly MarkerModel[];
  readonly unplaced: readonly FindingFields[];
  /** Texts of shown Finding elements that are not records. */
  readonly unreadableItems: readonly string[];
  readonly findingsNotice: string | null;
  /** Fixed text of the Findings list while the blacklight is off and the source has Findings; otherwise null. */
  readonly listHint: string | null;
  readonly noFindingsText: string | null;
}

export interface BlacklightModel {
  readonly kind: 'ok';
  readonly sources: readonly SourceModel[];
  readonly emptyText: string | null;
}

interface ParsedFinding {
  readonly index: number;
  readonly fields: FindingFields;
  readonly offset: number;
  readonly length: number;
  readonly placed: boolean;
}

function hexItems(codePoints: unknown): { hex: string[]; moreCount: number; count: number } {
  const list = arrayOf(codePoints);
  const all: number[] = [];
  if (list !== null) {
    for (const v of list) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0x10ffff) all.push(v);
    }
  }
  return {
    hex: all.slice(0, MARKER_CODEPOINTS).map(formatHex),
    moreCount: Math.max(0, all.length - MARKER_CODEPOINTS),
    count: all.length,
  };
}

function parseFinding(raw: unknown, index: number, textLength: number, mode: 'on' | 'off'): ParsedFinding | null {
  const p = pick(raw, 'category', 'line', 'column', 'offset', 'length', 'codePoints', 'rendering');
  if (p === null) return null;
  const { hex, moreCount, count } = hexItems(p.codePoints);
  const open = mode === 'on';
  const offset = p.offset;
  const length = p.length;
  const placed =
    typeof offset === 'number' &&
    typeof length === 'number' &&
    Number.isInteger(offset) &&
    Number.isInteger(length) &&
    offset >= 0 &&
    length >= 0 &&
    offset + length <= textLength;
  const rendering = open && typeof p.rendering === 'string' ? detail(p.rendering, MARKER_RENDERING) : '';
  return {
    index,
    offset: placed ? (offset as number) : 0,
    length: placed ? (length as number) : 0,
    placed,
    fields: {
      findingIndex: index,
      category: displayPrimitive(p.category, 40),
      position: `${displayPrimitive(p.line, 40)}:${displayPrimitive(p.column, 40)}`,
      offset: displayPrimitive(offset, 40),
      length: displayPrimitive(length, 40),
      codePointCount: codePointCountText(count),
      hex: open ? hex : [],
      moreCount: open ? moreCount : 0,
      rendering,
    },
  };
}

function toMarker(f: ParsedFinding): MarkerModel {
  const { findingIndex, category, position, codePointCount, hex, moreCount, rendering } = f.fields;
  return { findingIndex, category, position, codePointCount, hex, moreCount, rendering };
}

/** Difference-array coverage: result[i] > 0 when some finding in `list` covers code point i. */
function coverage(list: readonly ParsedFinding[], n: number): Int32Array {
  const d = new Int32Array(n + 1);
  for (const f of list) {
    if (f.length === 0) continue;
    d[f.offset] = (d[f.offset] ?? 0) + 1;
    d[f.offset + f.length] = (d[f.offset + f.length] ?? 0) - 1;
  }
  let run = 0;
  for (let i = 0; i < n; i++) {
    run += d[i] ?? 0;
    d[i] = run;
  }
  return d;
}

function buildSource(raw: unknown, index: number, mode: 'on' | 'off', reveal: BlacklightReveal): SourceModel {
  const p = pick(raw, 'source', 'text', 'scan');
  if (p === null) {
    return {
      label: unreadableItem(index),
      summary: unreadableItem(index),
      categoryCounts: HIDDEN_CATEGORIES.map((category) => ({ category, count: 0 })),
      lines: [],
      totalLines: 0,
      linesNotice: null,
      totalFindings: 0,
      entries: [],
      unplaced: [],
      unreadableItems: [],
      findingsNotice: null,
      listHint: null,
      noFindingsText: null,
    };
  }
  const label = compact(typeof p.source === 'string' ? p.source : displayPrimitive(p.source, 120));
  const cps = Array.from(typeof p.text === 'string' ? p.text : '');
  const n = cps.length;
  const scan = pick(p.scan, 'findings');
  const findings = arrayOf(scan?.findings) ?? [];
  const total = findings.length;

  // Per-category totals use the full findings array.
  const counts = new Map<string, number>();
  for (const f of findings) {
    const c = pick(f, 'category')?.category;
    if (typeof c === 'string') counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  const revealAll = reveal.findings.has(index);
  const shownCount = revealAll ? total : Math.min(total, BL_FINDINGS);
  const shown: ParsedFinding[] = [];
  const overflow: ParsedFinding[] = [];
  const unplaced: FindingFields[] = [];
  const unreadableItems: string[] = [];
  const entries: MarkerModel[] = [];
  for (let i = 0; i < total; i++) {
    const f = parseFinding(findings[i], i, n, mode);
    const isShown = i < shownCount;
    if (f === null) {
      if (isShown) unreadableItems.push(unreadableItem(i));
      continue;
    }
    if (!isShown) {
      if (f.placed) overflow.push(f);
      continue;
    }
    if (f.placed) {
      shown.push(f);
      entries.push(toMarker(f));
    } else {
      unplaced.push(f.fields);
    }
  }

  const shownCovered = coverage(shown, n);

  // Markers by start offset, in ScanResult.findings order.
  const markersAt = new Map<number, MarkerModel[]>();
  if (mode === 'on') {
    for (const f of shown) {
      const list = markersAt.get(f.offset) ?? [];
      list.push(toMarker(f));
      markersAt.set(f.offset, list);
    }
  }

  // Lay out lines (\n, \r\n, lone \r).
  const allLines: LineModel[] = [];
  let segments: Segment[] = [];
  let buf = '';
  const flushText = (): void => {
    if (buf !== '') {
      segments.push({ kind: 'text', text: buf });
      buf = '';
    }
  };
  const emitMarkers = (at: number): void => {
    const ms = markersAt.get(at);
    if (ms === undefined) return;
    flushText();
    for (const marker of ms) segments.push({ kind: 'marker', marker });
  };
  const endLine = (): void => {
    flushText();
    allLines.push({ number: allLines.length + 1, segments });
    segments = [];
  };
  for (let i = 0; i < n; i++) {
    emitMarkers(i);
    const ch = cps[i] ?? '';
    if (ch === '\n') {
      endLine();
    } else if (ch === '\r') {
      if (cps[i + 1] === '\n') {
        // The \n is consumed by the next iteration's own line break; skip it here.
        emitMarkers(i + 1);
        i++;
      }
      endLine();
    } else if ((shownCovered[i] ?? 0) === 0) {
      // Uncovered and overflow-covered code points alike go through the escaper.
      buf += escapeForDisplay(ch);
    }
  }
  emitMarkers(n);
  endLine();

  const revealLines = reveal.lines.has(index);
  const totalLines = allLines.length;
  const shownLines = revealLines ? totalLines : Math.min(totalLines, BL_LINES);

  return {
    label,
    summary: blacklightSummary(label, total),
    categoryCounts: HIDDEN_CATEGORIES.map((category) => ({ category, count: counts.get(category) ?? 0 })),
    lines: allLines.slice(0, shownLines),
    totalLines,
    linesNotice: shownLines < totalLines ? showing(shownLines, totalLines) : null,
    totalFindings: total,
    entries,
    unplaced,
    unreadableItems,
    findingsNotice: shownCount < total ? showing(shownCount, total) : null,
    listHint: mode === 'off' && total > 0 ? FINDINGS_LOCKED : null,
    noFindingsText: total === 0 ? NO_FINDINGS : null,
  };
}

export function buildBlacklightModel(
  sources: unknown,
  mode: 'on' | 'off',
  reveal: BlacklightReveal,
): BlacklightModel | Unreadable {
  const list = arrayOf(sources);
  if (list === null) return { kind: 'unreadable' };
  const out: SourceModel[] = [];
  for (let i = 0; i < list.length; i++) {
    try {
      out.push(buildSource(list[i], i, mode, reveal));
    } catch {
      out.push(buildSource(null, i, mode, reveal));
    }
  }
  return { kind: 'ok', sources: out, emptyText: out.length === 0 ? EMPTY_BLACKLIGHT : null };
}
