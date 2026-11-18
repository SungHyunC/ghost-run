// Property test for the diff summary bounds (task 7.3, Property 12). No Docker needed [no-docker].
// Hidden and control code points are built from numeric code points, never written literally.
import { compareCodePoints, sanitizeJudgeText } from '@ghost-run/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { diffSummary, MAX_DIFF_LINES, MAX_TEXT_CODE_POINTS } from '../lib/gate/output.mjs';
import { FC_PARAMS } from './pbt-config.mjs';

const FILE_KINDS = ['file-deleted', 'file-overwritten', 'file-created', 'symlink-changed'];

/** Hidden and control code points (tag, zero-width, bidi, C0, DEL: the HIDDEN_RANGES of core). */
const HIDDEN_CODE_POINTS = [
  0xe0001, 0xe0020, 0xe007f, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff,
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
  0x00, 0x01, 0x07, 0x08, 0x09, 0x0a, 0x0d, 0x1b, 0x1f, 0x7f,
];

/** @param {number} cp */
function isHidden(cp) {
  return (
    (cp >= 0xe0000 && cp <= 0xe007f) ||
    (cp >= 0x200b && cp <= 0x200d) ||
    cp === 0x2060 ||
    cp === 0xfeff ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp <= 0x1f ||
    cp === 0x7f
  );
}

const pathCharArb = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...'abcxyz/._-09'.split('')) },
  { weight: 2, arbitrary: fc.constantFrom(...HIDDEN_CODE_POINTS).map((cp) => String.fromCodePoint(cp)) },
);
// Short paths so that the 10 lines always fit in 1,200 code points even after escaping.
const pathArb = fc.array(pathCharArb, { maxLength: 8 }).map((a) => a.join(''));

const fileChangeArb = fc.record({ kind: fc.constantFrom(...FILE_KINDS), path: pathArb });
const sqlChangeArb = fc.record(
  {
    kind: fc.constant('sql-row-count'),
    table: fc.constant('t'),
    rowsBefore: fc.nat(1000),
    rowsAfter: fc.nat(1000),
    dropped: fc.boolean(),
  },
  { requiredKeys: ['kind', 'table', 'rowsBefore', 'rowsAfter'] },
);
const changeArb = fc.oneof({ weight: 3, arbitrary: fileChangeArb }, { weight: 1, arbitrary: sqlChangeArb });
// One flat list of 0 to 200 changes split into steps.
const listArb = fc
  .array(changeArb, { maxLength: 200 })
  .chain((all) => fc.array(fc.nat(all.length), { maxLength: 4 }).map((cuts) => {
    const pts = [0, ...[...cuts].sort((a, b) => a - b), all.length];
    return pts.slice(1).map((p, i) => all.slice(pts[i], p));
  }));

/** @param {ReadonlyArray<ReadonlyArray<any>>} steps */
function expectedHeader(steps) {
  const flat = steps.flat();
  const n = (/** @type {string} */ k) => flat.filter((c) => c.kind === k).length;
  let rows = 0;
  for (const c of flat) {
    if (c.kind !== 'sql-row-count') continue;
    rows += c.dropped === true ? Math.max(0, c.rowsBefore) : Math.max(0, c.rowsBefore - c.rowsAfter);
  }
  return `Diff summary: ${n('file-deleted')} deleted, ${n('file-overwritten')} overwritten, ${n('file-created')} created, ${n('symlink-changed')} symlinks changed, ${rows} rows lost.`;
}

describe('Property 12: Diff summary bounds', () => {
  it('header counts, <=10 sorted path lines, exact more line, <=1200 code points, no hidden code point, deterministic', () => {
    // **Validates: Requirements 7.4, 7.5, 7.10**
    fc.assert(
      fc.property(listArb, (steps) => {
        const out = diffSummary(steps);
        const lines = out.split('\n');
        expect(lines[0]).toBe(expectedHeader(steps));

        const fileItems = /** @type {{ kind: string, path: string }[]} */ (steps.flat().filter((c) => FILE_KINDS.includes(c.kind)));
        const last = lines.at(-1) ?? '';
        const hasMore = /^\+\d+ more changes\.$/.test(last);
        const pathLines = lines.slice(1, hasMore ? -1 : undefined);
        expect(pathLines.length).toBeLessThanOrEqual(MAX_DIFF_LINES);
        expect(pathLines.length).toBe(Math.min(fileItems.length, MAX_DIFF_LINES));

        // Path lines are in compareCodePoints order (path, then kind) and are the first of the sorted whole.
        const expected = fileItems
          .map((c) => ({ kind: c.kind, path: sanitizeJudgeText(c.path) }))
          .sort((a, b) => compareCodePoints(a.path, b.path) || compareCodePoints(a.kind, b.kind))
          .slice(0, MAX_DIFF_LINES)
          .map((i) => `  ${i.kind} ${i.path}`);
        expect(pathLines).toEqual(expected);

        // The more line appears exactly when more than 10 changes exist.
        expect(hasMore).toBe(fileItems.length > MAX_DIFF_LINES);
        if (hasMore) expect(last).toBe(`+${fileItems.length - MAX_DIFF_LINES} more changes.`);

        expect([...out].length).toBeLessThanOrEqual(MAX_TEXT_CODE_POINTS);
        for (const ch of out.replaceAll('\n', '')) expect(isHidden(ch.codePointAt(0) ?? 0)).toBe(false);

        expect(diffSummary(JSON.parse(JSON.stringify(steps)))).toBe(out);
      }),
      FC_PARAMS,
    );
  });

  it('keeps the total within 1,200 code points with long hidden-heavy paths', () => {
    // **Validates: Requirements 7.4, 7.5, 7.10**
    const longPath = fc.array(pathCharArb, { maxLength: 300 }).map((a) => a.join(''));
    fc.assert(
      fc.property(fc.array(fc.record({ kind: fc.constantFrom(...FILE_KINDS), path: longPath }), { maxLength: 30 }), (list) => {
        const out = diffSummary([list]);
        expect([...out].length).toBeLessThanOrEqual(MAX_TEXT_CODE_POINTS);
        for (const ch of out.replaceAll('\n', '')) expect(isHidden(ch.codePointAt(0) ?? 0)).toBe(false);
        expect(diffSummary([list])).toBe(out);
      }),
      FC_PARAMS,
    );
  });
});
