// Feature: ui-kit, Property 10: Blacklight coverage and involution (static leg, S leg)
// **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.8, 8.9, 8.10, 8.13, 14.5**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Finding, ScanResult } from '@ghost-run/core';
import { BlacklightPanelView } from '../../src/components/BlacklightView';
import { buildBlacklightModel } from '../../src/model/blacklight';
import type { BlacklightReveal } from '../../src/model/blacklight';
import { BLACKLIGHT_DISCLAIMER } from '../../src/model/texts';
import { findingsFor, longText, lines, scanOracle } from '../fixtures/arbitraries';
import { escapeHtml, renderMarkup } from '../support/markup';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

const cp = (n: number): string => String.fromCodePoint(n);
const hex = (n: number): string => `<U+${n.toString(16).toUpperCase().padStart(4, '0')}>`;
const SHOWN_MAX = 100;
const LINES_MAX = 200;
const SOURCE = 'notes/readme.md';

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

function insertAll(base: string, inserts: readonly (readonly [number, string])[]): string {
  const cps = Array.from(base);
  for (const [at, h] of inserts) cps.splice(at % (cps.length + 1), 0, h);
  return cps.join('');
}

const dirtyText: fc.Arbitrary<string> = fc
  .tuple(lines(1, 6), fc.array(fc.tuple(fc.nat(), hiddenCp), { maxLength: 12 }))
  .map(([base, inserts]) => insertAll(base, inserts));

const manyHiddenText: fc.Arbitrary<string> = fc
  .tuple(fc.array(hiddenCp, { minLength: 101, maxLength: 250 }), fc.constantFrom('x', 'x\n', 'ab '))
  .map(([hs, sep]) => hs.join(sep) + sep);

const longDirtyText: fc.Arbitrary<string> = fc
  .tuple(longText, fc.array(fc.tuple(fc.nat(), hiddenCp), { maxLength: 6 }))
  .map(([base, inserts]) => insertAll(base, inserts));

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

const isPlaced = (f: Finding, n: number): boolean => f.offset >= 0 && f.length >= 0 && f.offset + f.length <= n;

/** Independent rendering of the lines: covered code points omitted, `[M<i>]` markers when on. */
function expectedLines(c: Case, mode: 'on' | 'off', shownCount: number): string[] {
  const cps = Array.from(c.text, (ch) => ch.codePointAt(0) as number);
  const n = cps.length;
  const covered = new Set<number>();
  const markersAt = new Map<number, number[]>();
  c.scan.findings.slice(0, shownCount).forEach((f, i) => {
    if (!isPlaced(f, n)) return;
    for (let k = 0; k < f.length; k++) covered.add(f.offset + k);
    markersAt.set(f.offset, [...(markersAt.get(f.offset) ?? []), i]);
  });
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

function reveal(c: Case): BlacklightReveal {
  return {
    lines: new Set<number>(c.revealLines ? [0] : []),
    findings: new Set<number>(c.revealFindings ? [0] : []),
  };
}

function render(c: Case, mode: 'on' | 'off'): string {
  const model = buildBlacklightModel([{ source: SOURCE, text: c.text, scan: c.scan }], mode, reveal(c));
  if (model.kind !== 'ok') throw new Error('expected an ok model');
  return renderMarkup(<BlacklightPanelView model={model} />);
}

const MARK_RE = /<mark class="gk-marker" data-marker-index="(\d+)">.*?<\/mark>/gs;
const LINE_RE = /<li data-line="(\d+)"><span class="gk-line-no">\d+<\/span>(.*?)<\/li>/gs;

/** Lines of the markup as text, with each in-text marker replaced by `[M<i>]`. */
function markupLines(html: string): string[] {
  const ol = /<ol class="gk-lines">(.*?)<\/ol>/s.exec(html)?.[1] ?? '';
  return [...ol.matchAll(LINE_RE)].map((m) => (m[2] ?? '').replace(MARK_RE, (_s, i: string) => `[M${i}]`));
}

type Counter = ReturnType<typeof createCounter>;

function check(c: Case, counter: Counter): void {
  const findings = c.scan.findings;
  const n = findings.length;
  const textLen = Array.from(c.text).length;
  const shownCount = c.revealFindings ? n : Math.min(n, SHOWN_MAX);
  const shownIdx = findings.slice(0, shownCount).map((_, i) => i);
  const placedIdx = shownIdx.filter((i) => isPlaced(findings[i] as Finding, textLen));
  const unplacedIdx = shownIdx.filter((i) => !isPlaced(findings[i] as Finding, textLen));
  const totalLines = expectedLines(c, 'off', shownCount).length;
  const shownLines = c.revealLines ? totalLines : Math.min(totalLines, LINES_MAX);

  const off = render(c, 'off');
  const on = render(c, 'on');

  for (const html of [off, on]) {
    // Summary and category counts use the total.
    expect(html).toContain(`<p class="gk-summary">${escapeHtml(`${SOURCE}: ${n} findings`)}</p>`);
    const counts = [...html.matchAll(/<li class="gk-mono" data-category="[^"]*">[^<]*: (\d+)<\/li>/g)].map((m) =>
      Number(m[1]),
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBe(n);
    expect(html).toContain(escapeHtml(BLACKLIGHT_DISCLAIMER));
    if (n === 0) expect(html).toContain('No hidden text found by the blacklight.');
    else expect(html).not.toContain('No hidden text found by the blacklight.');

    // Findings list entries: one per placed shown Finding, in order. Off: category, position, and code point
    // count only. On: category, position, hex, and the expanded text.
    const isOn = html === on;
    const entryRe = /<li data-finding-index="(\d+)">(.*?)<\/li>/gs;
    const entries = [...html.matchAll(entryRe)];
    expect(entries.map((m) => Number(m[1]))).toEqual(placedIdx);
    for (const m of entries) {
      const f = findings[Number(m[1])] as Finding;
      expect(m[2]).toContain(`<span>${escapeHtml(`${f.category} ${f.line}:${f.column} `)}</span>`);
      if (isOn) {
        const hexes = f.codePoints.slice(0, 20).map(hex).join(' ');
        const more = f.codePoints.length > 20 ? ` +${f.codePoints.length - 20} more` : '';
        expect(m[2]).toContain(`<span class="gk-mono">${escapeHtml(hexes + more)}</span>`);
      } else {
        const count = `${f.codePoints.length} code point${f.codePoints.length === 1 ? '' : 's'}`;
        expect(m[2]).toBe(`<span>${escapeHtml(`${f.category} ${f.line}:${f.column} `)}</span><span class="gk-mono">${count}</span>`);
        expect(m[2]).not.toContain('&lt;U+');
        expect(m[2]).not.toContain('<mark');
      }
    }
    // The fixed list text appears exactly in the off state of a source with Findings.
    const hintCount = html.split('Turn on the blacklight to read it.').length - 1;
    expect(hintCount).toBe(!isOn && n > 0 ? 1 : 0);
    const unplaced = [...html.matchAll(/data-unplaced-index="(\d+)"/g)].map((m) => Number(m[1]));
    expect(unplaced).toEqual(unplacedIdx);
    if (unplacedIdx.length > 0) expect(html).toContain('Findings that could not be placed');

    // `Showing` texts and reveal buttons: lines first, then Findings.
    const texts = [...html.matchAll(/<span class="gk-reveal-text">([^<]*)<\/span>/g)].map((m) => m[1]);
    const buttons = [...html.matchAll(/<button type="button" class="gk-reveal-button" aria-label="([^"]*)">Show all<\/button>/g)].map(
      (m) => m[1],
    );
    const wantTexts: string[] = [];
    const wantButtons: string[] = [];
    if (shownLines < totalLines) {
      wantTexts.push(`Showing ${shownLines} of ${totalLines}`);
      wantButtons.push(`Show all ${totalLines} lines`);
    }
    if (shownCount < n) {
      wantTexts.push(`Showing ${shownCount} of ${n}`);
      wantButtons.push(`Show all ${n} findings`);
    }
    expect(texts).toEqual(wantTexts);
    expect(buttons).toEqual(wantButtons);
    expect(html).toContain(`<ol class="gk-lines">`);

    // Nothing hidden is shown raw.
    let rawHidden = false;
    for (const ch of html) if (isHidden(ch.codePointAt(0) as number)) rawHidden = true;
    expect(rawHidden).toBe(false);
  }

  // Line text in both states (hex for uncovered and overflow-covered code points, even when off).
  const wantOff = expectedLines(c, 'off', shownCount).slice(0, shownLines).map(escapeHtml);
  expect(markupLines(off)).toEqual(wantOff);
  const wantOn = expectedLines(c, 'on', shownCount).slice(0, shownLines).map(escapeHtml);
  expect(markupLines(on)).toEqual(wantOn);
  expect([...off.matchAll(/<ol class="gk-lines">(.*?)<\/ol>/gs)].some((m) => (m[1] ?? '').includes('<mark'))).toBe(false);

  // On and off differ only in the in-text markers, the Findings list items, the unplaced group, and the list text.
  const stripVariable = (html: string): string =>
    html
      .replace(/<ol class="gk-lines">(.*?)<\/ol>/s, (_s, inner: string) => `<ol class="gk-lines">${inner.replace(MARK_RE, '')}</ol>`)
      .replace(/<p class="gk-note" data-findings-hint="locked">.*?<\/p>/s, '')
      .replace(/<ul class="gk-list gk-findings">.*?<\/ul>/s, '')
      .replace(/<div role="group" aria-label="Findings that could not be placed".*?<\/ul><\/div>/s, '');
  expect(stripVariable(on)).toBe(stripVariable(off));
  // Involution: off, on, off restores the first off markup exactly.
  expect(render(c, 'off')).toBe(off);

  // Buckets.
  counter.add(c.origin);
  if (n > 0) counter.add('list-hint-off');
  counter.add(n > SHOWN_MAX ? 'findings>100' : 'findings<=100');
  counter.add(unplacedIdx.length > 0 ? 'has-unplaced' : 'all-placed');
  counter.add(totalLines > LINES_MAX ? 'lines>200' : 'lines<=200');
  counter.add(c.revealFindings ? 'findings-revealed' : 'findings-limited');
  counter.add(c.revealLines ? 'lines-revealed' : 'lines-limited');
  if (shownCount < n) counter.add('findings-notice');
  if (shownLines < totalLines) counter.add('lines-notice');
  if (/&lt;U\+[0-9A-F]{4,6}&gt;/.test(markupLines(off).join(''))) counter.add('hex-in-off');
}

describe('UI-P10 blacklight coverage and involution (static leg)', () => {
  it('UI-P10: panel markup shows entries, markers, notices, hex, counts; on and off differ only in markers', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter = createCounter('UI-P10 static');
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
      'lines-limited',
      'findings-notice',
      'lines-notice',
      'hex-in-off',
      'list-hint-off',
    ]);
  }, PBT_TIMEOUT);

  it('UI-P10: example, a Finding beyond the 100th keeps its code point as hex when off', () => {
    const zw = cp(0x200b);
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
    const c: Case = {
      text: `a${zw}b`,
      scan: { findings: [...Array.from({ length: 100 }, () => f(0)), f(1)] },
      origin: 'hand',
      revealLines: false,
      revealFindings: false,
    };
    const off = render(c, 'off');
    expect(markupLines(off)[0]).toBe(escapeHtml('<U+200B>b'));
    expect(off).toContain('Showing 100 of 101');
    expect(off).toContain('aria-label="Show all 101 findings"');
  });
});
