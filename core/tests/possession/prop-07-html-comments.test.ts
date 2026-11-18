// Feature: possession, Property 7: HTML comments are found as one finding each, only where markdown is true
// **Validates: Requirements 3.9, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8**
//
// Scope: supporting property, not P7 (HTML comments are an additional category, outside the P7
// negative direction). Not claimed: that renderers hide every comment form, or markdown structure
// parsing. The opener is built from code points; no literal hidden character appears here.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { createCounter } from '../pbt-stats.js';
import {
  CLOSER,
  OPENER,
  asciiReporter,
  hangul,
  lineBreak,
  ordinaryText,
  refPosition,
  toCodePoints,
} from './arbitraries.js';

// -- Generators ---------------------------------------------------------------

/** A hidden code point (tag, zero-width, or bidi) as a number, with its expected category. */
const hiddenWithCategory: fc.Arbitrary<{ cp: number; category: string }> = fc.oneof(
  fc.integer({ min: 0xe0000, max: 0xe007f }).map((cp) => ({ cp, category: 'tag' })),
  fc.constantFrom(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff).map((cp) => ({ cp, category: 'zero-width' })),
  fc
    .oneof(fc.integer({ min: 0x202a, max: 0x202e }), fc.integer({ min: 0x2066, max: 0x2069 }))
    .map((cp) => ({ cp, category: 'bidi' })),
);

type BodyPiece =
  | { kind: 'text'; text: string }
  | { kind: 'hidden'; cp: number; category: string };

const bodyPiece: fc.Arbitrary<BodyPiece> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc
      .integer({ min: 0x20, max: 0x7e })
      .map((c): BodyPiece => ({ kind: 'text', text: String.fromCharCode(c) })),
  },
  { weight: 1, arbitrary: hangul.map((text): BodyPiece => ({ kind: 'text', text })) },
  { weight: 2, arbitrary: lineBreak.map((text): BodyPiece => ({ kind: 'text', text })) },
  { weight: 2, arbitrary: fc.constant<BodyPiece>({ kind: 'text', text: OPENER }) },
  { weight: 1, arbitrary: fc.constant<BodyPiece>({ kind: 'text', text: '-' }) },
  { weight: 1, arbitrary: fc.constant<BodyPiece>({ kind: 'text', text: '>' }) },
  { weight: 3, arbitrary: hiddenWithCategory.map((h): BodyPiece => ({ kind: 'hidden', ...h })) },
);

/** A body whose opener-to-closer span has exactly one closer, at the end. */
function bodyIsClean(pieces: readonly BodyPiece[]): boolean {
  const body = pieces.map(renderBody).join('');
  const closed = OPENER + body + CLOSER;
  if (closed.indexOf(CLOSER, 4) !== closed.length - 3) return false;
  return (OPENER + body).indexOf(CLOSER, 4) === -1;
}

/** Hidden pieces are wrapped in letters so that two hidden pieces never form one run. */
function renderBody(p: BodyPiece): string {
  return p.kind === 'text' ? p.text : 'a' + String.fromCodePoint(p.cp) + 'b';
}

const commentBody: fc.Arbitrary<BodyPiece[]> = fc
  .array(bodyPiece, { maxLength: 8 })
  .filter(bodyIsClean);

interface Plan {
  plains: string[];
  bodies: BodyPiece[][];
  lastOpen: boolean;
}

const plans: fc.Arbitrary<Plan> = fc.record({
  plains: fc.array(ordinaryText, { minLength: 6, maxLength: 6 }),
  bodies: fc.array(commentBody, { minLength: 0, maxLength: 5 }),
  lastOpen: fc.boolean(),
});

interface ExpectedComment {
  offset: number;
  length: number;
  codePoints: number[];
  rendering: string;
  closed: boolean;
}
interface ExpectedHidden {
  offset: number;
  cp: number;
  category: string;
}
interface Built {
  text: string;
  comments: ExpectedComment[];
  hidden: ExpectedHidden[];
}

/** Build text and expectations from construction, not from scanning. */
function build(plan: Plan): Built {
  const cps: number[] = [];
  const comments: ExpectedComment[] = [];
  const hidden: ExpectedHidden[] = [];
  const push = (s: string): void => {
    for (const c of toCodePoints(s)) cps.push(c);
  };
  const n = plan.bodies.length;
  for (let i = 0; i < n; i++) {
    push(plan.plains[i] as string);
    const closed = !(plan.lastOpen && i === n - 1);
    const start = cps.length;
    const innerCps: number[] = [];
    push(OPENER);
    for (const piece of plan.bodies[i] as BodyPiece[]) {
      const before = cps.length;
      const s = renderBody(piece);
      push(s);
      for (const c of toCodePoints(s)) innerCps.push(c);
      if (piece.kind === 'hidden') hidden.push({ offset: before + 1, cp: piece.cp, category: piece.category });
    }
    if (closed) push(CLOSER);
    comments.push({
      offset: start,
      length: cps.length - start,
      codePoints: cps.slice(start),
      rendering: refRender(innerCps),
      closed,
    });
  }
  if (!(plan.lastOpen && n > 0)) push(plan.plains[n] as string);
  return { text: String.fromCodePoint(...cps), comments, hidden };
}

/** Independent rendering oracle: printable ASCII kept, Line_Break (CRLF once) to backslash n, rest as <U+XXXX>. */
function refRender(inner: readonly number[]): string {
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i] as number;
    if (c === 0x0d && inner[i + 1] === 0x0a) {
      out += String.fromCharCode(0x5c, 0x6e);
      i++;
    } else if (c === 0x0a || c === 0x0d) {
      out += String.fromCharCode(0x5c, 0x6e);
    } else if (c >= 0x20 && c <= 0x7e) {
      out += String.fromCharCode(c);
    } else {
      out += '<U+' + c.toString(16).toUpperCase().padStart(4, '0') + '>';
    }
  }
  return out;
}

const COMMENT = 'html-comment';

// -- Properties ---------------------------------------------------------------

describe('Property 7: HTML comments are found as one finding each, only where markdown is true', () => {
  // Feature: possession, Property 7: HTML comments are found as one finding each, only where markdown is true
  // **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 3.9**
  it(
    'markdown true and the default give the same comment findings, one per comment, with exact spans',
    () => {
      const stats = createCounter('P7-comments');
      let runs = 0;
      fc.assert(
        fc.property(plans, (plan) => {
          runs++;
          const built = build(plan);
          const { text, comments } = built;
          const explicit = scanText(text, { markdown: true }).findings;
          const implicit = scanText(text).findings;
          expect(implicit).toEqual(explicit);

          const found = explicit.filter((f) => f.category === COMMENT);
          expect(found.length).toBe(comments.length);
          found.forEach((f, i) => {
            const e = comments[i] as ExpectedComment;
            expect(f.offset).toBe(e.offset);
            expect(f.length).toBe(e.length);
            expect(f.codePoints).toEqual(e.codePoints);
            expect(f.firstCodePoint).toBe('U+003C');
            expect(f.rendering).toBe(e.rendering);
            expect(f.rendering).toMatch(/^[\u0020-\u007e]*$/);
            const pos = refPosition(text, f.offset);
            expect(f.line).toBe(pos.line);
            expect(f.column).toBe(pos.column);
          });

          stats.add('runs');
          if (comments.length > 0) stats.add('has-comment');
          if (comments.length > 1) stats.add('multiple-comments');
          if (comments.some((c) => c.closed)) stats.add('closed');
          if (comments.some((c) => !c.closed)) stats.add('unclosed-to-end');
          if (plan.bodies.some((b) => b.some((p) => p.kind === 'text' && p.text === OPENER))) {
            stats.add('nested-opener');
          }
          if (plan.bodies.some((b) => b.length === 0)) stats.add('empty-body');
          if (found.some((f) => f.line > 1)) stats.add('line>1');
          if (comments.some((c) => c.codePoints.includes(0x0d) && c.codePoints.includes(0x0a))) {
            stats.add('line-break-in-comment');
          }
          if (comments.length === 0) stats.add('no-comment');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      stats.print();
      expect(runs).toBe(NUM_RUNS);
      for (const key of [
        'has-comment',
        'multiple-comments',
        'closed',
        'unclosed-to-end',
        'nested-opener',
        'empty-body',
        'line>1',
        'line-break-in-comment',
        'no-comment',
      ]) {
        expect(stats.counts[key] ?? 0, `non-vacuity: ${key} (runs=${runs})`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: possession, Property 7: HTML comments are found as one finding each, only where markdown is true
  // **Validates: Requirements 5.7, 3.9**
  it(
    'markdown false returns no comment finding and leaves every other finding unchanged',
    () => {
      const stats = createCounter('P7-markdown-false');
      let runs = 0;
      fc.assert(
        fc.property(plans, (plan) => {
          runs++;
          const { text, comments } = build(plan);
          const on = scanText(text, { markdown: true }).findings;
          const off = scanText(text, { markdown: false }).findings;
          expect(off.filter((f) => f.category === COMMENT)).toEqual([]);
          expect(off).toEqual(on.filter((f) => f.category !== COMMENT));
          if (comments.length > 0) stats.add('comments-present-but-ignored');
          if (off.length > 0) stats.add('other-findings-kept');
          if (comments.length === 0) stats.add('no-comment');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      stats.print();
      expect(runs).toBe(NUM_RUNS);
      for (const key of ['comments-present-but-ignored', 'other-findings-kept', 'no-comment']) {
        expect(stats.counts[key] ?? 0, `non-vacuity: ${key} (runs=${runs})`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: possession, Property 7: HTML comments are found as one finding each, only where markdown is true
  // **Validates: Requirements 3.9, 5.5, 5.8**
  it(
    'a hidden run inside a comment gets its own finding, overlapping the comment finding',
    () => {
      const stats = createCounter('P7-hidden-in-comment');
      let runs = 0;
      fc.assert(
        fc.property(plans, (plan) => {
          runs++;
          const { text, comments, hidden } = build(plan);
          const findings = scanText(text, { markdown: true }).findings;
          for (const h of hidden) {
            const hit = findings.filter((f) => f.category !== COMMENT && f.offset === h.offset);
            expect(hit.length).toBe(1);
            const f = hit[0]!;
            expect(f.category).toBe(h.category);
            expect(f.length).toBe(1);
            expect(f.codePoints).toEqual([h.cp]);
            const inside = comments.some((c) => h.offset > c.offset && h.offset < c.offset + c.length);
            expect(inside).toBe(true);
            stats.add('hidden:' + h.category);
          }
          // The only non-comment findings are the planted ones (plain text is ordinary).
          expect(findings.filter((f) => f.category !== COMMENT).length).toBe(hidden.length);
          if (hidden.length > 0) stats.add('has-hidden-in-comment');
          if (hidden.length > 1) stats.add('multiple-hidden');
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
      stats.print();
      expect(runs).toBe(NUM_RUNS);
      for (const key of [
        'has-hidden-in-comment',
        'multiple-hidden',
        'hidden:tag',
        'hidden:zero-width',
        'hidden:bidi',
      ]) {
        expect(stats.counts[key] ?? 0, `non-vacuity: ${key} (runs=${runs})`).toBeGreaterThan(0);
      }
    },
    PBT_TIMEOUT ?? 0,
  );
});

describe('Property 7 fixed examples', () => {
  const comments = (t: string, markdown?: boolean) =>
    scanText(t, markdown === undefined ? undefined : { markdown }).findings.filter(
      (f) => f.category === COMMENT,
    );

  it('an opener with no closer ends the comment at the end of the text', () => {
    const t = 'x' + OPENER + 'abc';
    const [f] = comments(t);
    expect(f?.offset).toBe(1);
    expect(f?.length).toBe(t.length - 1);
    expect(f?.rendering).toBe('abc');
  });

  it('a nested opener does not start a second finding', () => {
    const t = OPENER + 'a' + OPENER + 'b' + CLOSER + 'c';
    expect(comments(t).length).toBe(1);
  });

  it('the dashes of the opener do not count as a closer', () => {
    const t = OPENER + '>' + 'z';
    const [f] = comments(t);
    expect(f?.length).toBe(t.length);
  });

  it('a comment inside a fenced code block is still found', () => {
    const fence = String.fromCharCode(0x60, 0x60, 0x60);
    const t = fence + '\n' + OPENER + 'x' + CLOSER + '\n' + fence;
    expect(comments(t).length).toBe(1);
    expect(comments(t, false).length).toBe(0);
  });
});
