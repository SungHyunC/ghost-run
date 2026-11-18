// Red thread: collect the addresses and paths of a ghost run (Needles) and look each one up
// in the texts the agent read (Provenance_Log). A lookup for a literal occurrence only.
// Pure, JSON-safe. Not a verdict input: a not-found link never changes a verdict.
// No literal hidden character appears here; every special value is a number.

import { formatCodePoint, isPrintableAscii } from './classify.js';
import { scanInternal } from './scan.js';
import { findAll } from './search.js';
import type {
  Needle,
  NeedleOrigin,
  NeedleSource,
  ProvenanceLog,
  ProvenanceRecord,
  ThreadLink,
} from './types.js';

// -- Needle collection -------------------------------------------------------

const ORIGIN_RANK: Readonly<Record<NeedleOrigin, number>> = {
  effect: 0,
  'observed-destination': 1,
  'observed-path': 2,
};

interface RankedNeedle {
  readonly needle: Needle;
  readonly rank: number;
  readonly sequence: number;
}

/** One Needle per non-empty destination or path of a report. Does not modify the report. */
export function collectNeedles(report: NeedleSource): Needle[] {
  const ranked: RankedNeedle[] = [];
  let sequence = 0;
  const add = (value: unknown, origin: NeedleOrigin, stepIndex: number): void => {
    if (typeof value === 'string' && value.length > 0) {
      ranked.push({
        needle: { value, origin, stepIndex },
        rank: ORIGIN_RANK[origin],
        sequence: sequence++,
      });
    }
  };

  report.effectsOutside.forEach((effects, stepIndex) => {
    for (const effect of effects) add(effect.destination, 'effect', stepIndex);
  });
  for (const event of report.observedEvents) {
    add(event.destination, 'observed-destination', event.stepIndex);
    add(event.path, 'observed-path', event.stepIndex);
  }

  ranked.sort(
    (a, b) =>
      a.needle.stepIndex - b.needle.stepIndex || a.rank - b.rank || a.sequence - b.sequence,
  );
  return ranked.map((r) => r.needle);
}

// -- Revealed text -----------------------------------------------------------

/** Revealed index range [rStart, rEnd) of one decoded tag run and its original range [uStart, uEnd). */
interface Segment {
  readonly rStart: number;
  readonly rEnd: number;
  readonly uStart: number;
  readonly uEnd: number;
}

interface Revealed {
  readonly text: string;
  readonly segments: readonly Segment[];
}

const LF = 0x0a;
const CR = 0x0d;

function buildRevealed(content: string): Revealed {
  const segments: Segment[] = [];
  let text = '';
  let cursor = 0;
  for (const entry of scanInternal(content, false)) {
    if (entry.finding.category !== 'tag') continue;
    text += content.slice(cursor, entry.unitStart);
    const rStart = text.length;
    text += entry.finding.rendering;
    segments.push({ rStart, rEnd: text.length, uStart: entry.unitStart, uEnd: entry.unitEnd });
    cursor = entry.unitEnd;
  }
  text += content.slice(cursor);
  return { text, segments };
}

/** Map a revealed index to the original UTF-16 index (inside a decoded run: its first tag). */
function toOriginal(revealed: Revealed, r: number): number {
  const segments = revealed.segments;
  let lo = 0;
  let hi = segments.length - 1;
  let before = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid] as Segment;
    if (r < seg.rStart) {
      hi = mid - 1;
    } else if (r >= seg.rEnd) {
      before = mid;
      lo = mid + 1;
    } else {
      return seg.uStart;
    }
  }
  if (before < 0) return r;
  const prev = segments[before] as Segment;
  return prev.uEnd + (r - prev.rEnd);
}

function overlapsSegment(revealed: Revealed, r0: number, r1: number): boolean {
  return revealed.segments.some((seg) => seg.rStart < r1 && seg.rEnd > r0);
}

// -- Lines -------------------------------------------------------------------

/** UTF-16 indices of line starts (same Line_Break rule as the scanner). */
function buildLineStarts(content: string): number[] {
  const starts = [0];
  for (let u = 0; u < content.length; u++) {
    const c = content.charCodeAt(u);
    if (c === LF) {
      starts.push(u + 1);
    } else if (c === CR) {
      if (content.charCodeAt(u + 1) === LF) u += 1;
      starts.push(u + 1);
    }
  }
  return starts;
}

function lineIndexOf(starts: readonly number[], u: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] as number) <= u) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const LINE_TEXT_MAX = 200;

/** ASCII-escaped line, cut at a whole token so the result has at most 200 characters. */
function lineTextOf(content: string, start: number): string {
  let out = '';
  for (let u = start; u < content.length; ) {
    const c = content.codePointAt(u) as number;
    if (c === LF || c === CR) break;
    u += c > 0xffff ? 2 : 1;
    const token = isPrintableAscii(c) ? String.fromCharCode(c) : '<' + formatCodePoint(c) + '>';
    if (out.length + token.length > LINE_TEXT_MAX) break;
    out += token;
  }
  return out;
}

function columnOf(content: string, lineStart: number, u: number): number {
  let column = 1;
  for (let i = lineStart; i < u; ) {
    const c = content.codePointAt(i) as number;
    i += c > 0xffff ? 2 : 1;
    column += 1;
  }
  return column;
}

// -- Matching ----------------------------------------------------------------

function isHigh(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLow(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

/** True when the range [start, end) does not cut a surrogate pair. */
function onPairBoundaries(text: string, start: number, end: number): boolean {
  if (start > 0 && isLow(text.charCodeAt(start)) && isHigh(text.charCodeAt(start - 1))) {
    return false;
  }
  if (end < text.length && isHigh(text.charCodeAt(end - 1)) && isLow(text.charCodeAt(end))) {
    return false;
  }
  return true;
}

function isWordUnit(unit: number, allowDot: boolean): boolean {
  return (
    (unit >= 0x41 && unit <= 0x5a) ||
    (unit >= 0x61 && unit <= 0x7a) ||
    (unit >= 0x30 && unit <= 0x39) ||
    unit === 0x5f ||
    unit === 0x2d ||
    (allowDot && unit === 0x2e)
  );
}

/**
 * Host of `<scheme>://<host>[:<port>][/<rest>]`, or undefined when the value
 * does not have that form or the host is empty.
 */
function parseHost(value: string): string | undefined {
  const sep = value.indexOf('://');
  if (sep < 1) return undefined;
  const scheme = value.slice(0, sep);
  if (!/^[A-Za-z][A-Za-z0-9+\-.]*$/.test(scheme)) return undefined;
  const rest = value.slice(sep + 3);
  const stop = rest.search(/[/?#]/);
  let authority = stop < 0 ? rest : rest.slice(0, stop);
  const at = authority.lastIndexOf('@');
  if (at >= 0) authority = authority.slice(at + 1);
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    if (close >= 0) authority = authority.slice(0, close + 1);
  } else {
    authority = authority.replace(/:[0-9]*$/, '');
  }
  return authority.length > 0 ? authority : undefined;
}

interface Match {
  readonly recordIndex: number;
  readonly start: number;
  readonly end: number;
  readonly matchedKey: 'value' | 'host';
}

// -- Red thread --------------------------------------------------------------

/** Link every Needle to the first record, line, and column that holds it. */
export function traceRedThread(log: ProvenanceLog, needles: readonly Needle[]): ThreadLink[] {
  const revealedCache: (Revealed | undefined)[] = new Array<Revealed | undefined>(log.length);
  const lineCache: (number[] | undefined)[] = new Array<number[] | undefined>(log.length);

  const revealedOf = (index: number): Revealed => {
    let cached = revealedCache[index];
    if (cached === undefined) {
      cached = buildRevealed((log[index] as { content: string }).content);
      revealedCache[index] = cached;
    }
    return cached;
  };
  const linesOf = (index: number): number[] => {
    let cached = lineCache[index];
    if (cached === undefined) {
      cached = buildLineStarts((log[index] as { content: string }).content);
      lineCache[index] = cached;
    }
    return cached;
  };

  const findValue = (value: string): Match | undefined => {
    for (let i = 0; i < log.length; i++) {
      const text = revealedOf(i).text;
      for (const start of findAll(text, value, false)) {
        const end = start + value.length;
        if (onPairBoundaries(text, start, end)) {
          return { recordIndex: i, start, end, matchedKey: 'value' };
        }
      }
    }
    return undefined;
  };

  const findHost = (host: string): Match | undefined => {
    for (let i = 0; i < log.length; i++) {
      const text = revealedOf(i).text;
      for (const start of findAll(text, host, true)) {
        const end = start + host.length;
        if (!onPairBoundaries(text, start, end)) continue;
        if (start > 0 && isWordUnit(text.charCodeAt(start - 1), true)) continue;
        if (end < text.length && isWordUnit(text.charCodeAt(end), false)) continue;
        return { recordIndex: i, start, end, matchedKey: 'host' };
      }
    }
    return undefined;
  };

  return needles.map((needle): ThreadLink => {
    let match = findValue(needle.value);
    if (match === undefined) {
      const host = parseHost(needle.value);
      if (host !== undefined) match = findHost(host);
    }
    if (match === undefined) return { status: 'not-found', needle };

    const record = log[match.recordIndex] as ProvenanceRecord;
    const revealed = revealedOf(match.recordIndex);
    const u = toOriginal(revealed, match.start);
    const starts = linesOf(match.recordIndex);
    const lineIndex = lineIndexOf(starts, u);
    const lineStart = starts[lineIndex] as number;
    return {
      status: 'found',
      needle,
      matchedKey: match.matchedKey,
      source: record.source,
      kind: record.kind,
      recordIndex: match.recordIndex,
      line: lineIndex + 1,
      column: columnOf(record.content, lineStart, u),
      lineText: lineTextOf(record.content, lineStart),
      hidden: overlapsSegment(revealed, match.start, match.end),
    };
  });
}
