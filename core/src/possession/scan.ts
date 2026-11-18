// Blacklight scan: one left-to-right pass over the text. Pure, no state between calls.
// No literal hidden character appears here; every special value is a number.

import {
  HTML_COMMENT_CLOSER,
  HTML_COMMENT_OPENER,
  classify,
  formatCodePoint,
  renderComment,
  renderNamedRun,
  renderTagRun,
} from './classify.js';
import { isPermittedZwj } from './emoji.js';
import { permittedTagSequenceEnd } from './tag-sequence.js';
import type { Finding, HiddenCategory, ScanOptions, ScanResult } from './types.js';

/** A Finding plus the UTF-16 range [unitStart, unitEnd) it covers. */
export interface ScanEntry {
  readonly finding: Finding;
  readonly unitStart: number;
  readonly unitEnd: number;
}

const CATEGORY_RANK: Readonly<Record<HiddenCategory, number>> = {
  tag: 0,
  'zero-width': 1,
  bidi: 2,
  'html-comment': 3,
};

const LF = 0x0a;
const CR = 0x0d;
const LESS_THAN = 0x3c;
const ZWJ = 0x200d;
const BLACK_FLAG = 0x1f3f4;

interface OpenRun {
  category: HiddenCategory;
  unitStart: number;
  offset: number;
  line: number;
  column: number;
  codePoints: number[];
}

function closeRun(run: OpenRun, unitEnd: number): ScanEntry {
  const first = run.codePoints[0] as number;
  const rendering =
    run.category === 'tag' ? renderTagRun(run.codePoints) : renderNamedRun(run.codePoints);
  return {
    finding: {
      category: run.category,
      line: run.line,
      column: run.column,
      offset: run.offset,
      length: run.codePoints.length,
      codePoints: run.codePoints,
      firstCodePoint: formatCodePoint(first),
      rendering,
    },
    unitStart: run.unitStart,
    unitEnd,
  };
}

function codePointsOf(text: string, start: number, end: number): number[] {
  const out: number[] = [];
  for (let u = start; u < end; ) {
    const c = text.codePointAt(u) as number;
    out.push(c);
    u += c > 0xffff ? 2 : 1;
  }
  return out;
}

function compareEntries(a: ScanEntry, b: ScanEntry): number {
  if (a.finding.offset !== b.finding.offset) return a.finding.offset - b.finding.offset;
  return CATEGORY_RANK[a.finding.category] - CATEGORY_RANK[b.finding.category];
}

function mergeSorted(a: readonly ScanEntry[], b: readonly ScanEntry[]): ScanEntry[] {
  const out: ScanEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (compareEntries(a[i] as ScanEntry, b[j] as ScanEntry) <= 0) out.push(a[i++] as ScanEntry);
    else out.push(b[j++] as ScanEntry);
  }
  while (i < a.length) out.push(a[i++] as ScanEntry);
  while (j < b.length) out.push(b[j++] as ScanEntry);
  return out;
}

/** Single pass scan that also reports the UTF-16 range of every entry. */
export function scanInternal(text: string, markdown: boolean): ScanEntry[] {
  const runEntries: ScanEntry[] = [];
  const commentEntries: ScanEntry[] = [];
  const n = text.length;

  let line = 1;
  let lineStartOffset = 0;
  let offset = 0;
  let permitEnd = -1;
  let commentEnd = 0;
  let run: OpenRun | null = null;

  let u = 0;
  while (u < n) {
    const c = text.codePointAt(u) as number;
    const w = c > 0xffff ? 2 : 1;

    if (c === BLACK_FLAG && u >= permitEnd) {
      permitEnd = permittedTagSequenceEnd(text, u);
    }
    let cat = classify(c);
    if (u < permitEnd) cat = 'none';
    if (c === ZWJ && cat !== 'none' && isPermittedZwj(text, u)) cat = 'none';

    if (run !== null && run.category !== cat) {
      runEntries.push(closeRun(run, u));
      run = null;
    }
    if (cat !== 'none') {
      if (run === null) {
        run = {
          category: cat,
          unitStart: u,
          offset,
          line,
          column: offset - lineStartOffset + 1,
          codePoints: [],
        };
      }
      run.codePoints.push(c);
    }

    if (markdown && c === LESS_THAN && u >= commentEnd && text.startsWith(HTML_COMMENT_OPENER, u)) {
      const closerAt = text.indexOf(HTML_COMMENT_CLOSER, u + 4);
      const innerEnd = closerAt < 0 ? n : closerAt;
      const end = closerAt < 0 ? n : closerAt + HTML_COMMENT_CLOSER.length;
      const codePoints = codePointsOf(text, u, end);
      commentEntries.push({
        finding: {
          category: 'html-comment',
          line,
          column: offset - lineStartOffset + 1,
          offset,
          length: codePoints.length,
          codePoints,
          firstCodePoint: formatCodePoint(c),
          rendering: renderComment(text.slice(u + 4, innerEnd)),
        },
        unitStart: u,
        unitEnd: end,
      });
      commentEnd = end;
    }

    if (c === LF || (c === CR && text.charCodeAt(u + 1) !== LF)) {
      line += 1;
      lineStartOffset = offset + 1;
    }

    u += w;
    offset += 1;
  }

  if (run !== null) runEntries.push(closeRun(run, n));
  return mergeSorted(runEntries, commentEntries);
}

/** Find hidden text in `text`. Pure, never throws for string input. */
export function scanText(text: string, options?: ScanOptions): ScanResult {
  const markdown = options?.markdown !== false;
  return { findings: scanInternal(text, markdown).map((entry) => entry.finding) };
}
