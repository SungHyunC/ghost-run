// Feature: possession, Property 19: The formatted report is bounded ASCII
// **Validates: Requirements 11.9, 11.10, 11.11**
//
// Scope: supporting property (safe output into the agent context). Claimed everywhere for the pure
// function. Not claimed: file reading and hook behavior.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { escapeAscii } from '../../src/possession/classify.js';
import { buildReport, formatReport } from '../../src/possession/entry.js';
import type { BlacklightReport, FileScan, Finding, HiddenCategory } from '../../src/possession/types.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { createCounter } from '../pbt-stats.js';
import { asciiReporter, toCodePoints } from './arbitraries.js';

const QUOTE = '"';
const BACKSLASH = String.fromCharCode(0x5c);
const MARK = '[truncated]';

const printable = fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c));
const special = fc.constantFrom(QUOTE, BACKSLASH, BACKSLASH + QUOTE, QUOTE + QUOTE, BACKSLASH + BACKSLASH);
const hiddenCp = fc.constantFrom(
  0xe0041, 0xe007f, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202a, 0x202e, 0x2066, 0x2069,
  0x0a, 0x0d, 0x09, 0x00, 0x7f, 0x85, 0x2028, 0xac00, 0x1f600,
);
const hiddenStr = hiddenCp.map((c) => String.fromCodePoint(c));
const lone = fc.constantFrom(String.fromCharCode(0xd800), String.fromCharCode(0xdc00));

const unit = fc.oneof(
  { weight: 6, arbitrary: printable },
  { weight: 3, arbitrary: special },
  { weight: 3, arbitrary: hiddenStr },
  { weight: 1, arbitrary: lone },
);

const textArb = fc.array(unit, { maxLength: 30 }).map((a) => a.join(''));
const pathArb = fc.oneof(
  { weight: 3, arbitrary: fc.array(printable, { minLength: 1, maxLength: 20 }).map((a) => a.join('')) },
  { weight: 3, arbitrary: textArb },
  { weight: 1, arbitrary: fc.constant('') },
);

const LENGTHS = [0, 1, 199, 200, 201, 1000];
interface Rend {
  readonly text: string;
  readonly ascii: boolean;
}
const renderingArb: fc.Arbitrary<Rend> = fc.oneof(
  // Printable ASCII (with quotes and backslashes) of boundary lengths.
  fc
    .tuple(fc.constantFrom(...LENGTHS), fc.array(fc.oneof(printable, special), { minLength: 1, maxLength: 5 }))
    .map(([n, pool]) => {
      let s = '';
      while (toCodePoints(s).length < n) s += pool[s.length % pool.length];
      return { text: Array.from(s).slice(0, n).join(''), ascii: true };
    }),
  // Arbitrary text with hidden code points; length near the cut.
  fc
    .tuple(fc.constantFrom(0, 5, 199, 200, 201, 300), textArb)
    .map(([n, t]) => {
      const base = Array.from(t);
      const pad = Array.from({ length: Math.max(0, n - base.length) }, (_, i) => (i % 7 === 0 ? 'q' : 'z'));
      return { text: base.concat(pad).join(''), ascii: false };
    }),
);

const categoryArb = fc.constantFrom<HiddenCategory>('tag', 'zero-width', 'bidi', 'html-comment');

const findingArb: fc.Arbitrary<Finding> = fc
  .tuple(categoryArb, fc.integer({ min: 1, max: 99999 }), fc.integer({ min: 1, max: 99999 }), renderingArb)
  .map(([category, line, column, r]) => ({
    category,
    line,
    column,
    offset: 0,
    length: 1,
    codePoints: [0x200b],
    firstCodePoint: 'U+200B',
    rendering: r.text,
  }));

type ReportKind = 'clean' | 'findings' | 'error';

/** One file. `findings` bounds the Finding count; `error` is 'none', 'some' (always), or 'any'. */
function fileArbOf(minFindings: number, maxFindings: number, error: 'none' | 'some' | 'any'): fc.Arbitrary<FileScan> {
  const errorArb: fc.Arbitrary<string | undefined> =
    error === 'none' ? fc.constant(undefined) : error === 'some' ? textArb : fc.option(textArb, { nil: undefined });
  return fc
    .tuple(pathArb, fc.array(findingArb, { minLength: minFindings, maxLength: maxFindings }), errorArb)
    .map(([path, findings, err]) => (err === undefined ? { path, findings } : { path, findings, error: err }));
}

/** Files around one required file, so the whole list has the wanted outcome (buildReport precedence). */
function around(required: fc.Arbitrary<FileScan>, others: fc.Arbitrary<FileScan>): fc.Arbitrary<FileScan[]> {
  return fc
    .tuple(fc.array(others, { maxLength: 2 }), required, fc.array(others, { maxLength: 2 }))
    .map(([before, one, after]) => [...before, one, ...after]);
}

const filesByKind: Record<ReportKind, fc.Arbitrary<FileScan[]>> = {
  // No Finding and no error anywhere; includes the empty list.
  clean: fc.array(fileArbOf(0, 0, 'none'), { maxLength: 5 }),
  // At least one Finding, no error.
  findings: around(fileArbOf(1, 4, 'none'), fileArbOf(0, 4, 'none')),
  // At least one error, anything else.
  error: around(fileArbOf(0, 4, 'some'), fileArbOf(0, 4, 'any')),
};

const KINDS: readonly ReportKind[] = ['clean', 'findings', 'error'];
const reportArbOf = (kind: ReportKind): fc.Arbitrary<BlacklightReport> =>
  filesByKind[kind].map((files) => buildReport(files));

/** Parses a quoted rendering at the start of `s`; returns the unescaped content and the tail. */
function parseQuoted(s: string): { content: string; tail: string } {
  expect(s[0]).toBe(QUOTE);
  let content = '';
  let i = 1;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch === BACKSLASH) {
      i++;
      content += s[i];
    } else if (ch === QUOTE) {
      return { content, tail: s.slice(i + 1) };
    } else {
      content += ch;
    }
  }
  throw new Error('unterminated quote');
}

describe('Property 19: The formatted report is bounded ASCII', () => {
  it(
    'formatReport output is printable ASCII plus LF, one line per Finding and error, quoted and capped renderings',
    () => {
      const counter = createCounter('P19 buckets');
      let runs = 0;
      // One fc.assert per outcome kind, each with ceil(NUM_RUNS / 3) runs: every outcome gets a
      // fixed third of the runs, so the ratio check below cannot flake.
      const runsPerKind = Math.ceil(NUM_RUNS / KINDS.length);
      for (const kind of KINDS) {
      fc.assert(
        fc.property(reportArbOf(kind), (report) => {
          runs++;
          expect(report.outcome).toBe(kind);
          const out = formatReport(report);

          // Only U+0020..U+007E and U+000A.
          for (const ch of out) {
            const c = ch.codePointAt(0) as number;
            expect(c === 0x0a || (c >= 0x20 && c <= 0x7e), 'code point ' + c).toBe(true);
          }

          const lines = out.split(String.fromCharCode(0x0a));
          const expected: Array<{ prefix: string; rendering?: Rend }> = [];
          for (const file of report.files) {
            const p = escapeAscii(file.path);
            for (const f of file.findings) {
              expected.push({
                prefix: `${p}:${f.line}:${f.column} ${f.category} ${f.firstCodePoint} `,
                rendering: { text: f.rendering, ascii: true },
              });
            }
            if (file.error !== undefined) expected.push({ prefix: `${p}: error ` });
          }
          // One line per Finding, one per error entry, one final summary line.
          expect(lines.length).toBe(expected.length + 1);
          expect(lines[lines.length - 1]).toBe(
            `outcome=${report.outcome} findings=${report.totalFindings} files=${report.files.length}`,
          );
          counter.add('outcome=' + report.outcome);
          if (report.files.length === 0) counter.add('no-files');

          expected.forEach((e, i) => {
            const line = lines[i];
            expect(line.startsWith(e.prefix), 'prefix of line ' + i).toBe(true);
            const { content, tail } = parseQuoted(line.slice(e.prefix.length));
            if (e.rendering === undefined) {
              expect(tail).toBe('');
              counter.add('error-line');
              return;
            }
            const cps = toCodePoints(e.rendering.text);
            const cut = cps.length > 200;
            // Nothing follows the closing quote except the truncation marker.
            expect(tail).toBe(cut ? MARK : '');
            counter.add(cut ? 'truncated' : 'not-truncated');
            if (cps.length === 200) counter.add('len=200');
            if (cps.length === 201) counter.add('len=201');
            if (cps.length >= 1000) counter.add('len=1000');
            // Content is the first 200 code points (checked when the rendering is printable ASCII).
            const asciiOnly = cps.every((c) => c >= 0x20 && c <= 0x7e);
            if (asciiOnly) {
              expect(content).toBe(cps.slice(0, 200).map((c) => String.fromCharCode(c)).join(''));
              counter.add('ascii-rendering');
              if (/["\\]/.test(e.rendering.text)) counter.add('quote-or-backslash');
            } else {
              expect(toCodePoints(content).length).toBeLessThanOrEqual(cut ? 200 * 10 : 200 * 10);
              expect(content).toBe(escapeAscii(content));
              counter.add('hidden-rendering');
            }
          });

          expect(formatReport(report)).toBe(out);
        }),
        { numRuns: runsPerKind, reporter: asciiReporter },
      );
      }
      console.log(`P19 runs=${runs} (NUM_RUNS=${NUM_RUNS}) ${counter.summary()}`);
      expect(runs).toBeGreaterThanOrEqual(NUM_RUNS);
      // Each outcome occurs in at least 20% of the runs.
      for (const outcome of KINDS) {
        const ratio = (counter.counts['outcome=' + outcome] ?? 0) / runs;
        expect(ratio, `outcome=${outcome} ratio ${ratio} (runs=${runs})`).toBeGreaterThanOrEqual(0.2);
      }
      for (const bucket of [
        'error-line',
        'truncated',
        'not-truncated',
        'len=200',
        'len=201',
        'len=1000',
        'ascii-rendering',
        'quote-or-backslash',
        'hidden-rendering',
      ]) {
        expect(counter.counts[bucket] ?? 0, `bucket ${bucket} is empty`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  it('example: a 1000-character rendering with a quote is cut to 200 and marked', () => {
    const rendering = QUOTE + 'a'.repeat(999);
    const finding: Finding = {
      category: 'tag',
      line: 1,
      column: 1,
      offset: 0,
      length: 1,
      codePoints: [0xe0041],
      firstCodePoint: 'U+E0041',
      rendering,
    };
    const out = formatReport(buildReport([{ path: 'a.md', findings: [finding] }]));
    const [first] = out.split(String.fromCharCode(0x0a));
    expect(first).toBe(`a.md:1:1 tag U+E0041 ${QUOTE}${BACKSLASH}${QUOTE}${'a'.repeat(199)}${QUOTE}${MARK}`);
  });
});
