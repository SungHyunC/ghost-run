import { describe, expect, it } from 'vitest';
import { buildBlacklightModel } from '../../src/model/blacklight';
import type { BlacklightModel, SourceModel } from '../../src/model/blacklight';

const NO_REVEAL = { lines: new Set<number>(), findings: new Set<number>() };
const ZW = String.fromCodePoint(0x200b);

function finding(offset: number, length: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: 'zero-width',
    line: 1,
    column: offset + 1,
    offset,
    length,
    codePoints: [0x200b],
    firstCodePoint: 'U+200B',
    rendering: '<U+200B>',
    ...extra,
  };
}

function build(sources: unknown, mode: 'on' | 'off', reveal = NO_REVEAL): SourceModel[] {
  const m: BlacklightModel | { kind: 'unreadable' } = buildBlacklightModel(sources, mode, reveal);
  if (m.kind !== 'ok') throw new Error('expected ok');
  return [...m.sources];
}

function lineText(s: SourceModel, i: number): string {
  return (s.lines[i]?.segments ?? []).map((g) => (g.kind === 'text' ? g.text : `[M${g.marker.findingIndex}]`)).join('');
}

describe('buildBlacklightModel', () => {
  it('handles empty and unreadable input', () => {
    const m = buildBlacklightModel([], 'off', NO_REVEAL);
    expect(m).toMatchObject({ kind: 'ok', emptyText: 'No texts to scan.' });
    expect(buildBlacklightModel('x', 'off', NO_REVEAL)).toEqual({ kind: 'unreadable' });
  });

  it('omits covered code points off, shows a marker on', () => {
    const src = [{ source: 'README', text: `ab${ZW}cd`, scan: { findings: [finding(2, 1)] } }];
    const off = build(src, 'off')[0]!;
    const on = build(src, 'on')[0]!;
    expect(lineText(off, 0)).toBe('abcd');
    expect(lineText(on, 0)).toBe('ab[M0]cd');
    expect(on.entries).toHaveLength(1);
    expect(off.entries).toEqual(on.entries);
    expect(on.summary).toBe('README: 1 findings');
    expect(on.entries[0]?.hex).toEqual(['<U+200B>']);
    expect(on.entries[0]?.position).toBe('1:3');
  });

  it('shows uncovered hidden code points as hex in both states', () => {
    const src = [{ source: 's', text: `a${ZW}b`, scan: { findings: [] } }];
    expect(lineText(build(src, 'off')[0]!, 0)).toBe('a<U+200B>b');
    expect(lineText(build(src, 'on')[0]!, 0)).toBe('a<U+200B>b');
    expect(build(src, 'on')[0]?.noFindingsText).toBe('No hidden text found by the blacklight.');
  });

  it('keeps Findings beyond the 100th visible as hex when off (overflow exception)', () => {
    const text = ZW.repeat(101);
    const findings = Array.from({ length: 101 }, (_, i) => finding(i, 1));
    const src = [{ source: 's', text, scan: { findings } }];
    const off = build(src, 'off')[0]!;
    expect(off.totalFindings).toBe(101);
    expect(off.entries).toHaveLength(100);
    expect(off.findingsNotice).toBe('Showing 100 of 101');
    expect(lineText(off, 0)).toBe('<U+200B>');
    const revealed = build(src, 'off', { lines: new Set(), findings: new Set([0]) })[0]!;
    expect(revealed.entries).toHaveLength(101);
    expect(lineText(revealed, 0)).toBe('');
    expect(revealed.findingsNotice).toBeNull();
  });

  it('splits lines on LF, CRLF and CR and limits to 200 lines', () => {
    const s = build([{ source: 's', text: 'a\nb\r\nc\rd', scan: { findings: [] } }], 'off')[0]!;
    expect(s.lines.map((_, i) => lineText(s, i))).toEqual(['a', 'b', 'c', 'd']);
    const long = build([{ source: 's', text: 'x\n'.repeat(250), scan: { findings: [] } }], 'off')[0]!;
    expect(long.lines).toHaveLength(200);
    expect(long.linesNotice).toBe('Showing 200 of 251');
  });

  it('lists unplaced and unreadable Findings without dropping them', () => {
    const src = [{ source: 's', text: 'abc', scan: { findings: [finding(2, 5), 7] } }];
    const s = build(src, 'on')[0]!;
    expect(s.unplaced).toHaveLength(1);
    expect(s.unreadableItems).toEqual(['Unreadable item 1']);
    expect(s.totalFindings).toBe(2);
    expect(lineText(s, 0)).toBe('abc');
  });

  it('caps hex items at 20 with a more count', () => {
    const f = finding(0, 1, { codePoints: Array.from({ length: 25 }, () => 0xe0041) });
    const s = build([{ source: 's', text: ZW, scan: { findings: [f] } }], 'on')[0]!;
    expect(s.entries[0]?.hex).toHaveLength(20);
    expect(s.entries[0]?.moreCount).toBe(5);
  });
});
