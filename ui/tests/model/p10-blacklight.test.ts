// Feature: ui-kit, Property 10: Blacklight coverage and involution (model leg, V)
// **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.8, 8.9, 8.10, 8.13, 14.5**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Finding, ScanResult } from '@ghost-run/core';
import { buildBlacklightModel } from '../../src/model/blacklight';
import type { BlacklightReveal, SourceModel } from '../../src/model/blacklight';
import { findingsFor, longText, lines, scanOracle } from '../fixtures/arbitraries';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

const cp = (n: number): string => String.fromCodePoint(n);
const hex = (n: number): string => `<U+${n.toString(16).toUpperCase().padStart(4, '0')}>`;
const SHOWN_MAX = 100;
const LINES_MAX = 200;

/** Independent oracle: code points the display must never show raw (no LF or CR). */
function isHidden(c: number): boolean {
  return (
    (c >= 0xe0000 && c <= 0xe007f) ||
    (c >= 0x200b && c <= 0x200d) ||
    c === 0x2060 ||
    c === 0xfeff ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2066 && c <= 0x2069) ||
    (c <= 0x1f && c !== 0x0a && c !== 0x0d) ||
    (c >= 0x7f && c <= 0x9f)
  );
}

const hiddenCp: fc.Arbitrary<string> = fc
  .oneof(
    fc.integer({ min: 0xe0000, max: 0xe007f }),
    fc.constantFrom(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff),
    fc.integer({ min: 0x202a, max: 0x202e }),
    fc.integer({ min: 0x2066, max: 0x2069 }),
    fc.integer({ min: 0x01, max: 0x08 }),
  )
  .map(cp);

/** Ordinary lines (LF, CRLF, lone CR) with 0 to 12 hidden code points inserted at arbitrary positions. */
const dirtyText: fc.Arbitrary<string> = fc
  .tuple(lines(1, 6), fc.array(fc.tuple(fc.nat(), hiddenCp), { maxLength: 12 }))
  .map(([base, inserts]) => {
    const cps = Array.from(base);
    for (const [at, h] of inserts) cps.splice(at % (cps.length + 1), 0, h);
    return cps.join('');
  });

/** 101 to 250 separated hidden code points, so the scanner reports more than 100 Findings. */
const manyHiddenText: fc.Arbitrary<string> = fc
  .tuple(fc.array(hiddenCp, { minLength: 101, maxLength: 250 }), fc.constantFrom('x', 'x\n', 'ab '))
  .map(([hs, sep]) => hs.join(sep) + sep);

/** 201 to 400 lines with a few hidden code points. */
const longDirtyText: fc.Arbitrary<string> = fc
  .tuple(longText, fc.array(fc.tuple(fc.nat(), hiddenCp), { maxLength: 6 }))
  .map(([base, inserts]) => {
    const cps = Array.from(base);
    for (const [at, h] of inserts) cps.splice(at % (cps.length + 1), 0, h);
    return cps.join('');
  });

interface Case {
  readonly text: string;
  readonly scan: ScanResult;
  readonly origin: 'oracle' | 'hand' | 'hand-many';
  readonly revealLines: boolean;
  readonly revealFindings: boolean;
}

const caseArb: fc.Arbitrary<Case> = fc
  .tuple(
    fc.oneof(
      { weight: 4, arbitrary: dirtyText },
      { weight: 2, arbitrary: manyHiddenText },
      { weight: 2, arbitrary: longDirtyText },
    ),
    fc.constantFrom<Case['origin']>('oracle', 'oracle', 'hand', 'hand-many'),
    fc.boolean(),
    fc.boolean(),
  )
  .chain(([text, origin, revealLines, revealFindings]) => {
    const scan: fc.Arbitrary<ScanResult> =
      origin === 'oracle'
        ? fc.constant(scanOracle(text))
        : findingsFor(text, origin === 'hand-many').map((findings) => ({ findings }));
    return scan.map((s) => ({ text, scan: s, origin, revealLines, revealFindings }));
  });

function revealOf(c: Case): BlacklightReveal {
  return {
    lines: new Set<number>(c.revealLines ? [0] : []),
    findings: new Set<number>(c.revealFindings ? [0] : []),
  };
}

function modelOf(c: Case, mode: 'on' | 'off', reveal: BlacklightReveal = revealOf(c)): SourceModel {
  const m = buildBlacklightModel([{ source: 'notes/readme.md', text: c.text, scan: c.scan }], mode, reveal);
  if (m.kind !== 'ok') throw new Error('expected an ok model');
  const s = m.sources[0];
  if (s === undefined) throw new Error('expected one source');
  return s;
}

const isPlaced = (f: Finding, n: number): boolean => f.offset >= 0 && f.length >= 0 && f.offset + f.length <= n;

/** Independent rendering of the lines: omitted covered code points, `[M<i>]` markers when on. */
function expectedLines(c: Case, mode: 'on' | 'off', shownCount: number): string[] {
  const cps = Array.from(c.text, (ch) => ch.codePointAt(0) as number);
  const n = cps.length;
  const shown = c.scan.findings.slice(0, shownCount).map((f, i) => ({ f, i })).filter(({ f }) => isPlaced(f, n));
  const covered = new Set<number>();
  const markersAt = new Map<number, number[]>();
  for (const { f, i } of shown) {
    for (let k = 0; k < f.length; k++) covered.add(f.offset + k);
    markersAt.set(f.offset, [...(markersAt.get(f.offset) ?? []), i]);
  }
  const marks = (at: number): string =>
    mode === 'on' ? (markersAt.get(at) ?? []).map((i) => `[M${i}]`).join('') : '';
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < n; i++) {
    cur += marks(i);
    const ch = cps[i] as number;
    if (ch === 0x0a) {
      out.push(cur);
      cur = '';
    } else if (ch === 0x0d) {
      if (cps[i + 1] === 0x0a) {
        cur += marks(i + 1);
        i++;
      }
      out.push(cur);
      cur = '';
    } else if (!covered.has(i)) {
      cur += isHidden(ch) ? hex(ch) : cp(ch);
    }
  }
  cur += marks(n);
  out.push(cur);
  return out;
}

const textOfLines = (s: SourceModel): string[] =>
  s.lines.map((l) => l.segments.map((g) => (g.kind === 'text' ? g.text : `[M${g.marker.findingIndex}]`)).join(''));

function check(c: Case, counter: ReturnType<typeof createCounter>): void {
  const findings = c.scan.findings;
  const n = findings.length;
  const textLen = Array.from(c.text).length;
  const k = Math.min(n, SHOWN_MAX);
  const shownCount = c.revealFindings ? n : k;
  const off = modelOf(c, 'off');
  const on = modelOf(c, 'on');

  // Summary and category counts use the total, in every state.
  for (const m of [off, on]) {
    expect(m.summary).toBe(`notes/readme.md: ${n} findings`);
    expect(m.totalFindings).toBe(n);
    expect(m.categoryCounts.reduce((a, x) => a + x.count, 0)).toBe(n);
  }

  // One placed entry per shown Finding, in order; unplaced shown Findings are grouped separately.
  const shownIdx = findings.slice(0, shownCount).map((_, i) => i);
  const placedIdx = shownIdx.filter((i) => isPlaced(findings[i] as Finding, textLen));
  const unplacedIdx = shownIdx.filter((i) => !isPlaced(findings[i] as Finding, textLen));
  for (const m of [off, on]) {
    expect(m.entries.map((e) => e.findingIndex)).toEqual(placedIdx);
    expect(m.unplaced.map((u) => u.findingIndex)).toEqual(unplacedIdx);
    for (const e of m.entries) {
      const f = findings[e.findingIndex] as Finding;
      expect(e.category).toBe(f.category);
      expect(e.position).toBe(`${f.line}:${f.column}`);
      expect(e.codePointCount).toBe(`${f.codePoints.length} code point${f.codePoints.length === 1 ? '' : 's'}`);
      if (m === on) {
        expect(e.hex).toEqual(f.codePoints.slice(0, 20).map(hex));
        expect(e.moreCount).toBe(Math.max(0, f.codePoints.length - 20));
        expect(e.rendering === '').toBe(f.rendering === '');
      } else {
        // Off: only category, position, and code point count; no hex and no expanded text.
        expect(e.hex).toEqual([]);
        expect(e.moreCount).toBe(0);
        expect(e.rendering).toBe('');
      }
    }
    for (const u of m.unplaced) {
      if (m === off) {
        expect(u.hex).toEqual([]);
        expect(u.rendering).toBe('');
      }
    }
    // The fixed list text appears exactly while the switch is off and the source has Findings.
    expect(m.listHint).toBe(m === off && n > 0 ? 'Turn on the blacklight to read it.' : null);
    // Findings limit and its notice.
    expect(m.findingsNotice).toBe(shownCount < n ? `Showing ${shownCount} of ${n}` : null);
    // Lines limit and its notice.
    const total = expectedLines(c, 'off', shownCount).length;
    expect(m.totalLines).toBe(total);
    const shownLines = c.revealLines ? total : Math.min(total, LINES_MAX);
    expect(m.lines).toHaveLength(shownLines);
    expect(m.linesNotice).toBe(shownLines < total ? `Showing ${shownLines} of ${total}` : null);
  }

  // The in-text markers are exactly those of the placed shown Findings.
  const markerIdx: number[] = [];
  let visibleMarkers = 0;
  for (const l of on.lines) {
    for (const g of l.segments) if (g.kind === 'marker') markerIdx.push(g.marker.findingIndex);
  }
  for (const l of off.lines) for (const g of l.segments) expect(g.kind).toBe('text');
  const totalOn = expectedLines(c, 'on', shownCount).join('\n').match(/\[M\d+\]/g)?.length ?? 0;
  if (on.lines.length === on.totalLines) {
    expect([...markerIdx].sort((a, b) => a - b)).toEqual(placedIdx);
    visibleMarkers = markerIdx.length;
    expect(visibleMarkers).toBe(totalOn);
  }

  // Exact text in both states (covers: covered code points omitted off, uncovered and overflow-covered as hex).
  const wantOff = expectedLines(c, 'off', shownCount).slice(0, off.lines.length);
  const wantOn = expectedLines(c, 'on', shownCount).slice(0, on.lines.length);
  expect(textOfLines(off)).toEqual(wantOff);
  expect(textOfLines(on)).toEqual(wantOn);

  // No hidden code point is ever shown raw, in either state.
  for (const m of [off, on]) {
    for (const l of m.lines) {
      for (const g of l.segments) {
        if (g.kind !== 'text') continue;
        for (const ch of g.text) expect(isHidden(ch.codePointAt(0) as number)).toBe(false);
      }
    }
  }

  // Involution: off, on, off with the same reveal restores the first off model exactly. The on state differs
  // from off in the in-text markers, the list items (hex and expanded text), and the list text.
  const off2 = modelOf(c, 'off');
  expect(off2).toEqual(off);
  expect(modelOf(c, 'on')).toEqual(on);

  // Buckets.
  counter.add(c.origin);
  if (on.entries.some((e) => e.rendering !== '')) counter.add('expanded-text-on');
  counter.add(n > SHOWN_MAX ? 'findings>100' : 'findings<=100');
  if (n === 0) counter.add('no-findings');
  counter.add(placedIdx.length < shownIdx.length ? 'has-unplaced' : 'all-placed');
  counter.add(on.totalLines > LINES_MAX ? 'lines>200' : 'lines<=200');
  counter.add(c.revealFindings ? 'findings-revealed' : 'findings-limited');
  counter.add(c.revealLines ? 'lines-revealed' : 'lines-limited');
  const cpsAll = Array.from(c.text, (ch) => ch.codePointAt(0) as number);
  const coveredShown = new Set<number>();
  const coveredOverflow = new Set<number>();
  findings.forEach((f, i) => {
    if (!isPlaced(f, textLen)) return;
    for (let j = 0; j < f.length; j++) (i < shownCount ? coveredShown : coveredOverflow).add(f.offset + j);
  });
  if (cpsAll.some((x, i) => isHidden(x) && !coveredShown.has(i) && coveredOverflow.has(i))) counter.add('overflow-only-hidden');
  if (cpsAll.some((x, i) => isHidden(x) && !coveredShown.has(i) && !coveredOverflow.has(i))) counter.add('uncovered-hidden');
  if (cpsAll.some((x, i) => isHidden(x) && coveredShown.has(i))) counter.add('covered-hidden');
}

describe('UI-P10 blacklight coverage and involution (model leg)', () => {
  it('UI-P10: coverage, limits, counts, and involution hold for generated texts and Findings', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter = createCounter('UI-P10 blacklight');
    fc.assert(
      fc.property(caseArb, (c) => check(c, counter)),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, [
      'oracle',
      'hand',
      'hand-many',
      'findings>100',
      'findings<=100',
      'has-unplaced',
      'all-placed',
      'lines>200',
      'findings-revealed',
      'findings-limited',
      'lines-revealed',
      'covered-hidden',
      'uncovered-hidden',
      'expanded-text-on',
    ]);
  }, PBT_TIMEOUT);

  it('UI-P10: a Finding beyond the 100th keeps its code points visible as hex when off and on', () => {
    const zw = cp(0x200b);
    const text = 'a' + zw + 'b';
    const f = (offset: number): Finding => ({
      category: 'zero-width',
      line: 1,
      column: offset + 1,
      offset,
      length: 1,
      codePoints: [0x200b],
      firstCodePoint: 'U+200B',
      rendering: '<U+200B>',
    });
    // 100 Findings at offset 0 (a letter, so shown-covered), the 101st covers the zero-width code point.
    const c: Case = {
      text,
      scan: { findings: [...Array.from({ length: 100 }, () => f(0)), f(1)] },
      origin: 'hand',
      revealLines: false,
      revealFindings: false,
    };
    for (const mode of ['off', 'on'] as const) {
      const m = modelOf(c, mode);
      expect(m.findingsNotice).toBe('Showing 100 of 101');
      expect(m.summary).toBe('notes/readme.md: 101 findings');
      expect(textOfLines(m)[0]?.endsWith('<U+200B>b')).toBe(true);
    }
    // Revealing the Findings covers it: omitted when off.
    const revealed = modelOf({ ...c, revealFindings: true }, 'off');
    expect(textOfLines(revealed)[0]).toBe('b');
  });
});
