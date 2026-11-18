// Example tests for the scan entry point: scanTexts, buildReport precedence, exitCodeFor.
// **Validates: Requirements 11.6, 13.12**

import { describe, expect, it } from 'vitest';
import { buildReport, exitCodeFor, scanTexts } from '../../src/possession/entry.js';

const OPENER = String.fromCodePoint(0x3c, 0x21, 0x2d, 0x2d);
const ZWSP = String.fromCodePoint(0x200b);

describe('exitCodeFor', () => {
  it('maps clean, findings, error to 0, 1, 2', () => {
    expect(exitCodeFor('clean')).toBe(0);
    expect(exitCodeFor('findings')).toBe(1);
    expect(exitCodeFor('error')).toBe(2);
  });
});

describe('scanTexts', () => {
  it('reports clean for ordinary input and for an empty input list', () => {
    expect(scanTexts([{ path: 'a.md', text: 'hello' }])).toMatchObject({ outcome: 'clean', totalFindings: 0 });
    expect(scanTexts([])).toEqual({ outcome: 'clean', files: [], totalFindings: 0 });
  });

  it('reports findings and keeps the input order', () => {
    const report = scanTexts([
      { path: 'b.txt', text: 'a' + ZWSP },
      { path: 'a.txt', text: 'ok' },
    ]);
    expect(report.outcome).toBe('findings');
    expect(report.totalFindings).toBe(1);
    expect(report.files.map((f) => f.path)).toEqual(['b.txt', 'a.txt']);
    expect(exitCodeFor(report.outcome)).toBe(1);
  });

  it('scans comments only for markdown extensions, case-insensitively', () => {
    const text = 'x' + OPENER + 'hidden';
    const count = (path: string) => scanTexts([{ path, text }]).totalFindings;
    expect(count('README.md')).toBe(1);
    expect(count('doc.MDX')).toBe(1);
    expect(count('doc.markdown')).toBe(1);
    expect(count('page.html')).toBe(0);
    expect(count('.md')).toBe(0);
  });

  it('lets the markdown option override the extension rule', () => {
    const text = OPENER + 'c';
    expect(scanTexts([{ path: 'a.txt', text }], { markdown: true }).totalFindings).toBe(1);
    expect(scanTexts([{ path: 'a.md', text }], { markdown: false }).totalFindings).toBe(0);
    expect(scanTexts([{ path: 'a.md', text }], { markdown: 'by-extension' }).totalFindings).toBe(1);
  });

  it('is deterministic', () => {
    const inputs = [{ path: 'a.md', text: 'a' + ZWSP + OPENER }];
    expect(scanTexts(inputs)).toEqual(scanTexts(inputs));
  });
});

describe('buildReport precedence', () => {
  it('gives error over findings over clean', () => {
    const finding = scanTexts([{ path: 'x', text: ZWSP }]).files[0]?.findings ?? [];
    const withError = buildReport([
      { path: 'x', findings: finding },
      { path: 'y', findings: [], error: 'cannot read y: ENOENT' },
    ]);
    expect(withError.outcome).toBe('error');
    expect(withError.totalFindings).toBe(1);
    expect(exitCodeFor(withError.outcome)).toBe(2);
    expect(buildReport([{ path: 'x', findings: finding }]).outcome).toBe('findings');
    expect(buildReport([{ path: 'x', findings: [] }]).outcome).toBe('clean');
  });
});
