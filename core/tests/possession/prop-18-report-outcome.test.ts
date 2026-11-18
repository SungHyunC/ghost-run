// Feature: possession, Property 18: Report outcome, order, and markdown selection follow the rules
// **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.6, 11.7, 11.12**
//
// Scope: supporting property (hook entry, pure function). Claimed everywhere for the pure function.
// Not claimed: file reading and hook behavior.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { exitCodeFor, scanTexts } from '../../src/possession/entry.js';
import { scanText } from '../../src/possession/scan.js';
import type { Outcome, ScanInput } from '../../src/possession/types.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { createCounter } from '../pbt-stats.js';
import { CLOSER, OPENER, anyText, asciiReporter } from './arbitraries.js';

const NAME_CHARS = 'abcXYZ019_-';
const nameStem = fc.string({ unit: fc.constantFrom(...NAME_CHARS.split('')), minLength: 1, maxLength: 6 });

const MD_EXTS = ['md', 'markdown', 'mdx'];
const OTHER_EXTS = ['txt', 'mdd', 'm', 'markdowns', 'mdxx', 'json', 'ts', 'bak', 'xmd', ''];

/** Random letter case per character. */
const caseVariant = (s: string): fc.Arbitrary<string> =>
  fc
    .array(fc.boolean(), { minLength: s.length, maxLength: s.length })
    .map((flags) => s.split('').map((ch, i) => (flags[i] ? ch.toUpperCase() : ch)).join(''));

interface PathCase {
  readonly kind: string;
  readonly path: string;
}

const baseNameArb: fc.Arbitrary<PathCase> = fc.oneof(
  // markdown extension in any letter case
  fc
    .tuple(nameStem, fc.constantFrom(...MD_EXTS))
    .chain(([stem, ext]) => caseVariant(ext).map((e) => ({ kind: 'md-ext', path: stem + '.' + e }))),
  // other extensions
  fc
    .tuple(nameStem, fc.constantFrom(...OTHER_EXTS))
    .chain(([stem, ext]) => caseVariant(ext).map((e) => ({ kind: 'other-ext', path: stem + '.' + e }))),
  // double extension: the last one decides
  fc
    .tuple(nameStem, fc.constantFrom(...MD_EXTS), fc.constantFrom(...OTHER_EXTS.filter((e) => e !== '')))
    .map(([stem, a, b]) => ({ kind: 'double-ext', path: stem + '.' + a + '.' + b })),
  fc
    .tuple(nameStem, fc.constantFrom(...OTHER_EXTS.filter((e) => e !== '')), fc.constantFrom(...MD_EXTS))
    .map(([stem, a, b]) => ({ kind: 'double-ext', path: stem + '.' + a + '.' + b })),
  // no extension
  nameStem.map((stem) => ({ kind: 'no-ext', path: stem })),
  // leading-dot names
  fc.constantFrom(...MD_EXTS, 'gitignore', 'env').map((n) => ({ kind: 'leading-dot', path: '.' + n })),
  // trailing dot
  nameStem.map((stem) => ({ kind: 'trailing-dot', path: stem + '.' })),
);

const BS = String.fromCharCode(0x5c);

const dirArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  // backslash separators: plain, drive letter, mixed with '/', and dotted directory names
  nameStem.map((d) => d + BS),
  fc.tuple(nameStem, nameStem).map(([a, b]) => 'C:' + BS + a + BS + b + BS),
  fc.tuple(nameStem, nameStem).map(([a, b]) => a + '/' + b + BS),
  fc.tuple(nameStem, nameStem).map(([a, b]) => a + BS + b + '/'),
  fc.constantFrom(...MD_EXTS).map((e) => 'docs.' + e + BS),
  fc.constantFrom(...MD_EXTS).map((e) => 'a.' + e + '/b.d' + BS),
  fc.constantFrom(...MD_EXTS).map((e) => 'x.' + e + BS + 'y.d/'),
  nameStem.map((d) => d + '/'),
  fc.constantFrom(...MD_EXTS).map((e) => 'docs.' + e + '/'),
  fc.constantFrom(...MD_EXTS).map((e) => 'a.' + e + '/b.d/'),
  fc.constant('./'),
  fc.constant('/'),
);

const pathArb: fc.Arbitrary<PathCase> = fc
  .tuple(dirArb, baseNameArb)
  .map(([dir, b]) => ({ kind: dir.includes('.') && dir !== './' ? b.kind + '+dotted-dir' : b.kind, path: dir + b.path }));

/** Expected markdown selection, written independently of the implementation. */
function expectedMarkdown(path: string): boolean {
  // The name is whatever follows the last '/' or backslash.
  const last = path.split(/[\\/]/).pop() as string;
  const idx = last.lastIndexOf('.');
  if (idx <= 0) return false;
  const ext = last.slice(idx + 1).toLowerCase();
  return ext === 'md' || ext === 'markdown' || ext === 'mdx';
}

const COMMENT_ONLY = OPENER + 'x' + CLOSER;
const ZWSP = String.fromCharCode(0x200b);

const textArb: fc.Arbitrary<{ kind: string; text: string }> = fc.oneof(
  { weight: 4, arbitrary: fc.constant({ kind: 'comment-only', text: COMMENT_ONLY }) },
  { weight: 3, arbitrary: fc.constant({ kind: 'plain', text: 'plain text' }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'zero-width', text: 'a' + ZWSP + 'b' }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'empty', text: '' }) },
  { weight: 4, arbitrary: anyText.map((text) => ({ kind: 'any', text })) },
);

const inputArb: fc.Arbitrary<{ pathKind: string; textKind: string; input: ScanInput }> = fc
  .tuple(pathArb, textArb)
  .map(([p, t]) => ({ pathKind: p.kind, textKind: t.kind, input: { path: p.path, text: t.text } }));

// Unit-length lists, empty lists, and longer lists; paths may repeat.
const inputsArb = fc.array(inputArb, { minLength: 0, maxLength: 8 });

describe('Property 18: Report outcome, order, and markdown selection follow the rules', () => {
  it(
    'scanTexts keeps input order, selects markdown by extension, sums findings, and maps outcomes to exit codes',
    () => {
      const counter = createCounter('P18 buckets');
      let runs = 0;
      fc.assert(
        fc.property(inputsArb, (items) => {
          runs++;
          const inputs = items.map((i) => i.input);
          const before = JSON.stringify(inputs);
          const report = scanTexts(inputs);

          // One entry per input, in input order.
          expect(report.files.length).toBe(inputs.length);
          expect(report.files.map((f) => f.path)).toEqual(inputs.map((i) => i.path));
          counter.add('len=' + (inputs.length === 0 ? '0' : inputs.length === 1 ? '1' : '2+'));

          let sum = 0;
          let mdSeen = false;
          let nonMdSeen = false;
          items.forEach(({ input, pathKind, textKind }, idx) => {
            const md = expectedMarkdown(input.path);
            const entry = report.files[idx];
            const expected = scanText(input.text, { markdown: md }).findings;
            expect(entry.findings).toEqual(expected);
            expect(entry.error).toBeUndefined();
            sum += entry.findings.length;
            counter.add('path=' + pathKind);
            counter.add(md ? 'markdown' : 'not-markdown');
            if (input.path.includes(BS)) {
              counter.add('backslash-path');
              counter.add(md ? 'backslash-markdown' : 'backslash-not-markdown');
              if (input.path.includes('/')) counter.add('backslash-mixed-separators');
            }
            if (md) mdSeen = true;
            else nonMdSeen = true;

            if (textKind === 'comment-only') {
              // The comment-only text yields a Finding exactly when markdown is applied.
              expect(entry.findings.length > 0).toBe(md);
              counter.add(md ? 'comment-only/markdown/finding' : 'comment-only/other/no-finding');
            }
            if (entry.findings.length > 0) counter.add('entry-with-findings');
            else counter.add('entry-clean');
          });
          if (mdSeen && nonMdSeen) counter.add('mixed-md-and-other');

          expect(report.totalFindings).toBe(sum);
          expect(report.outcome).toBe(sum > 0 ? 'findings' : 'clean');
          counter.add('outcome=' + report.outcome);

          // Deterministic and non-destructive.
          expect(scanTexts(inputs)).toStrictEqual(report);
          expect(JSON.stringify(inputs)).toBe(before);
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      console.log(`P18 runs=${runs} (NUM_RUNS=${NUM_RUNS}) ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      for (const bucket of [
        'len=0',
        'len=1',
        'len=2+',
        'path=md-ext',
        'path=other-ext',
        'path=double-ext',
        'path=no-ext',
        'path=leading-dot',
        'path=md-ext+dotted-dir',
        'markdown',
        'not-markdown',
        'backslash-path',
        'backslash-markdown',
        'backslash-not-markdown',
        'backslash-mixed-separators',
        'comment-only/markdown/finding',
        'comment-only/other/no-finding',
        'entry-with-findings',
        'entry-clean',
        'mixed-md-and-other',
        'outcome=clean',
        'outcome=findings',
      ]) {
        expect(counter.counts[bucket] ?? 0, `bucket ${bucket} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('exitCodeFor maps clean, findings, error to 0, 1, 2', () => {
    const cases: Array<[Outcome, number]> = [
      ['clean', 0],
      ['findings', 1],
      ['error', 2],
    ];
    for (const [outcome, code] of cases) expect(exitCodeFor(outcome)).toBe(code);
  });
});
