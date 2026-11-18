// Example tests for formatReport.
// **Validates: Requirements 11.9, 11.10, 11.11**

import { describe, expect, it } from 'vitest';
import { buildReport, formatReport, scanTexts } from '../../src/possession/entry.js';

const OPENER = String.fromCodePoint(0x3c, 0x21, 0x2d, 0x2d);
const CLOSER = String.fromCodePoint(0x2d, 0x2d, 0x3e);
const ZWSP = String.fromCodePoint(0x200b);
const BACKSLASH = String.fromCharCode(0x5c);
const QUOTE = String.fromCharCode(0x22);

function tags(ascii: string): string {
  return String.fromCodePoint(...Array.from(ascii, (c) => 0xe0000 + (c.codePointAt(0) as number)));
}

function isPrintableAsciiOrLf(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c !== 0x0a && (c < 0x20 || c > 0x7e)) return false;
  }
  return true;
}

describe('formatReport', () => {
  it('writes one line per finding plus a summary line', () => {
    const report = scanTexts([
      { path: 'a.md', text: 'x' + tags('hi') },
      { path: 'b.txt', text: 'ok' },
    ]);
    expect(formatReport(report)).toBe(
      ['a.md:1:2 tag U+E0068 "hi"', 'outcome=findings findings=1 files=2'].join('\n'),
    );
  });

  it('writes only the summary line for a clean report', () => {
    expect(formatReport(scanTexts([{ path: 'a.txt', text: 'ok' }]))).toBe(
      'outcome=clean findings=0 files=1',
    );
  });

  it('quotes the rendering and escapes backslash and double quote', () => {
    const text = OPENER + 'say ' + QUOTE + 'hi' + QUOTE + ' ' + BACKSLASH + 'n' + CLOSER;
    const out = formatReport(scanTexts([{ path: 'a.md', text }]));
    const line = out.split('\n')[0] as string;
    const expectedRendering =
      QUOTE + 'say ' + BACKSLASH + QUOTE + 'hi' + BACKSLASH + QUOTE + ' ' + BACKSLASH + BACKSLASH + 'n' + QUOTE;
    expect(line).toBe('a.md:1:1 html-comment U+003C ' + expectedRendering);
  });

  it('truncates a rendering to 200 code points and appends [truncated] after the quote', () => {
    const long = OPENER + 'a'.repeat(250) + CLOSER;
    const line = formatReport(scanTexts([{ path: 'a.md', text: long }])).split('\n')[0] as string;
    expect(line).toBe('a.md:1:1 html-comment U+003C ' + QUOTE + 'a'.repeat(200) + QUOTE + '[truncated]');
  });

  it('does not mark a rendering of exactly 200 code points as truncated', () => {
    const exact = OPENER + 'a'.repeat(200) + CLOSER;
    const line = formatReport(scanTexts([{ path: 'a.md', text: exact }])).split('\n')[0] as string;
    expect(line.endsWith(QUOTE)).toBe(true);
    expect(line).not.toContain('[truncated]');
  });

  it('escapes hidden characters in the path', () => {
    const out = formatReport(scanTexts([{ path: 'a' + ZWSP + '.txt', text: ZWSP }]));
    expect(out.split('\n')[0]).toBe('a<U+200B>.txt:1:1 zero-width U+200B "<U+200B ZERO WIDTH SPACE>"');
  });

  it('writes an error line and an error summary', () => {
    const report = buildReport([
      { path: 'gone.md', findings: [], error: 'cannot read gone.md: ENOENT' },
      { path: 'ok.txt', findings: [] },
    ]);
    expect(formatReport(report)).toBe(
      [
        'gone.md: error "cannot read gone.md: ENOENT"',
        'outcome=error findings=0 files=2',
      ].join('\n'),
    );
  });

  it('quotes and escapes the error text', () => {
    const report = buildReport([
      { path: 'p', findings: [], error: 'bad ' + QUOTE + 'x' + QUOTE + ZWSP },
    ]);
    expect(formatReport(report).split('\n')[0]).toBe(
      'p: error ' + QUOTE + 'bad ' + BACKSLASH + QUOTE + 'x' + BACKSLASH + QUOTE + '<U+200B>' + QUOTE,
    );
  });

  it('emits only printable ASCII and line feeds for hidden input', () => {
    const text = 'a' + tags('secret') + ZWSP + String.fromCodePoint(0x202e) + OPENER + String.fromCodePoint(0x1f600);
    const out = formatReport(scanTexts([{ path: 'n' + String.fromCodePoint(0xac00) + '.md', text }]));
    expect(isPrintableAsciiOrLf(out)).toBe(true);
  });
});
