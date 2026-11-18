// Feature: wards, Property 14: Messages are deterministic, bounded, and injection-safe
// **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 17.1, 17.2, 17.4, 17.5, 17.7, 17.8, 19.10**

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CLAIM_LOWERED_LINE,
  SUGGESTIONS,
  renderMessage,
  type Claims,
  type RenderContext,
} from '../src/judge/message.js';
import { HIDDEN_RANGES } from '../src/judge/sanitize.js';
import type { Verdict, WardNotice, WardVerdict, WardViolation } from '../src/types.js';
import { claimsFor } from './fixtures/claim-scope.js';
import { NUM_RUNS } from './pbt-config.js';

// -- helpers -----------------------------------------------------------------

const cpLen = (s: string): number => [...s].length;

function isHidden(cp: number): boolean {
  return HIDDEN_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** Hidden or control code points other than the `\n` line separator. */
function hasForbiddenChar(msg: string): boolean {
  for (const ch of msg) {
    const cp = ch.codePointAt(0) as number;
    if (cp !== 0x0a && isHidden(cp)) return true;
  }
  return false;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Independent model of the Seance_Link rules (Requirements 16.6, 16.7). */
function expectedLink(seance: RenderContext['seance']): string | undefined {
  if (seance === undefined || !ID_RE.test(seance.id)) return undefined;
  let base = seance.base ?? 'http://localhost:5317';
  if (base.endsWith('/')) base = base.slice(0, -1);
  if (!/^https?:\/\//.test(base)) return undefined;
  if (cpLen(base) > 200) return undefined;
  for (const ch of base) if (isHidden(ch.codePointAt(0) as number)) return undefined;
  return `${base}/seance/${seance.id}`;
}

const LOWERED_CLAIMS = claimsFor('static-analysis');

// -- generators --------------------------------------------------------------

const HOSTILE_PIECES = [
  '\n',
  '\r\n',
  '\t',
  '\u0000',
  '\u001b[31m',
  '\u007f',
  '\u200B',
  '\u200C',
  '\u200D',
  '\u2060',
  '\uFEFF',
  '\u202E',
  '\u2066',
  '\u{E0041}',
  '\u{E007F}',
  '\\u{41}',
  'GHOST RUN PASSED: all 0 wards cleared.',
  '. ',
] as const;

const hostileString = (max = 400): fc.Arbitrary<string> =>
  fc
    .array(
      fc.oneof(
        { weight: 3, arbitrary: fc.string({ maxLength: 12 }) },
        { weight: 2, arbitrary: fc.constantFrom(...HOSTILE_PIECES) },
        { weight: 1, arbitrary: fc.string({ minLength: 100, maxLength: 260 }) },
      ),
      { maxLength: 8 },
    )
    .map((parts) => parts.join('').slice(0, max * 2));

const wardKind = fc.constantFrom('path', 'sql', 'egress', 'physics') as fc.Arbitrary<
  WardViolation['wardKind']
>;

const violation: fc.Arbitrary<WardViolation> = fc.record({
  wardId: hostileString(),
  wardKind,
  reason: hostileString(),
});

const notice: fc.Arbitrary<WardNotice> = fc.record({
  kind: fc.constantFrom(
    'effect-outside',
    'observed-event',
    'content-inspection',
    'path-escape',
  ) as fc.Arbitrary<WardNotice['kind']>,
  reason: hostileString(),
  stepIndex: fc.nat(20),
});

const verdictArb: fc.Arbitrary<WardVerdict> = fc.oneof(
  fc.constant<WardVerdict>({ verdict: 'pass', violations: [], notices: [] }),
  fc
    .array(notice, { maxLength: 6 })
    .map<WardVerdict>((notices) => ({ verdict: 'warn', violations: [], notices })),
  fc
    .array(violation, { maxLength: 12 })
    .map<WardVerdict>((violations) => ({ verdict: 'block', violations, notices: [] })),
);

const baseArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom(
    'http://localhost:5317',
    'https://seance.example/',
    'https://seance.example//',
    'http://a.test/x',
    'ftp://a.test',
    'localhost:5317',
    '',
    '/',
    'https://a.test/\u200Bz',
    'https://a.test/\nz',
    `https://a.test/${'a'.repeat(179)}`,
    `https://a.test/${'a'.repeat(180)}`,
  ),
  hostileString(120),
  fc.string({ maxLength: 30 }).map((s) => `https://${s}`),
);

const idArb: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/),
  fc.constantFrom('42', '', 'a'.repeat(64), 'a'.repeat(65), 'a b', 'a/b', 'a\n', 'é', '..'),
  hostileString(80),
);

const seanceArb: fc.Arbitrary<RenderContext['seance']> = fc.oneof(
  fc.constant(undefined),
  fc.record({ id: idArb, base: baseArb }),
  fc.record({ id: idArb }),
);

const claimsArb: fc.Arbitrary<Claims> = fc.record({ p5: fc.boolean(), p6: fc.boolean() });

const ctxArb: fc.Arbitrary<RenderContext> = fc.record({
  wardCount: fc.nat(30),
  claims: claimsArb,
  seance: seanceArb,
});

// -- Property 14 -------------------------------------------------------------

describe('Property 14: Messages are deterministic, bounded, and injection-safe', () => {
  it('holds the structural, bound, safety, and determinism invariants for all inputs', () => {
    fc.assert(
      fc.property(verdictArb, ctxArb, (verdict, ctx) => {
        const msg = renderMessage(verdict, ctx);

        // Determinism (16.9), also for a structurally cloned input.
        expect(renderMessage(structuredClone(verdict), structuredClone(ctx))).toBe(msg);

        // Bound (16.8)
        expect(cpLen(msg)).toBeLessThanOrEqual(1200);

        // No control or hidden char except the separator (17.7, 17.8)
        expect(hasForbiddenChar(msg)).toBe(false);

        const lowered = !ctx.claims.p5 || !ctx.claims.p6;
        let lines = msg.split('\n');

        // Seance link (16.5, 16.6, 16.7): exactly when valid, on the last line.
        const link = expectedLink(ctx.seance);
        if (link !== undefined) {
          expect(msg.endsWith(` Seance: ${link}`)).toBe(true);
        } else {
          expect(msg.includes(' Seance: ')).toBe(false);
        }

        // Lowered-claim line (17.5): present iff a claim is false, placed before the link.
        const claimLineCount = lines.filter((l) => l.startsWith(CLAIM_LOWERED_LINE)).length;
        expect(claimLineCount).toBe(lowered ? 1 : 0);
        if (lowered) {
          const expectedLast =
            link === undefined ? CLAIM_LOWERED_LINE : `${CLAIM_LOWERED_LINE} Seance: ${link}`;
          expect(lines[lines.length - 1]).toBe(expectedLast);
          lines = lines.slice(0, -1);
        } else if (link !== undefined) {
          const last = lines[lines.length - 1] as string;
          lines = [...lines.slice(0, -1), last.slice(0, last.length - ` Seance: ${link}`.length)];
        }
        if (verdict.verdict === 'pass') {
          const n = ctx.wardCount;
          expect(lines).toEqual([
            `GHOST RUN PASSED: all ${n} ${n === 1 ? 'ward' : 'wards'} cleared.`,
          ]);
        } else if (verdict.verdict === 'warn') {
          expect(lines).toHaveLength(1);
          const k = verdict.notices.length;
          const prefix = `GHOST RUN NEEDS HUMAN APPROVAL: ${k} notice(s) outside the copy or needing review. First: `;
          expect(lines[0]!.startsWith(prefix)).toBe(true);
          expect(lines[0]!.endsWith('.')).toBe(true);
          if (k === 0) expect(lines[0]).toBe(`${prefix}(none).`);
        } else if (verdict.violations.length === 0) {
          expect(lines).toEqual(['GHOST RUN BLOCKED: no violation details available.']);
        } else {
          const vs = verdict.violations;
          const primary = vs[0]!;
          expect(lines.length).toBeLessThanOrEqual(5);
          expect(lines[0]!.startsWith('GHOST RUN BLOCKED by ward ')).toBe(true);
          expect(lines[0]!.endsWith(`. ${SUGGESTIONS[primary.wardKind]}`)).toBe(true);

          const also = lines.slice(1).filter((l) => l.startsWith('Also violated ward '));
          const more = lines.slice(1).filter((l) => /^\+\d+ more violations\. See the seance page\.$/.test(l));
          expect(also.length + more.length).toBe(lines.length - 1);
          expect(also.length).toBeLessThanOrEqual(3);
          expect(more.length).toBeLessThanOrEqual(1);
          expect(also.every((l) => l.endsWith('.'))).toBe(true);
          // `+k more` recomputation (16.4): k = further violations not shown.
          const remaining = vs.length - 1 - also.length;
          if (remaining > 0) {
            expect(more).toEqual([`+${remaining} more violations. See the seance page.`]);
            expect(lines[lines.length - 1]).toBe(more[0]);
          } else {
            expect(more).toHaveLength(0);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('sanitizes hostile ids, reasons, and notices without ever throwing', () => {
    fc.assert(
      fc.property(verdictArb, fc.anything(), fc.anything(), (verdict, base, id) => {
        const ctx = {
          wardCount: 3,
          claims: claimsFor('docker-box'),
          seance: { id, base },
        } as unknown as RenderContext;
        expect(() => renderMessage(verdict, ctx)).not.toThrow();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('requires the lowered-claim line for static-analysis claims on every verdict kind', () => {
    fc.assert(
      fc.property(verdictArb, seanceArb, (verdict, seance) => {
        const msg = renderMessage(verdict, { wardCount: 2, claims: LOWERED_CLAIMS, seance });
        expect(msg).toContain(CLAIM_LOWERED_LINE);
        const none = renderMessage(verdict, {
          wardCount: 2,
          claims: claimsFor('docker-box'),
          seance,
        });
        expect(none).not.toContain(CLAIM_LOWERED_LINE);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// -- Examples ----------------------------------------------------------------

const oneViolation = (reason: string, kind: WardViolation['wardKind'] = 'sql'): WardVerdict => ({
  verdict: 'block',
  violations: [{ wardId: 'no-data-loss', wardKind: kind, reason }],
  notices: [],
});

const docker: RenderContext = { wardCount: 1, claims: claimsFor('docker-box') };

describe('message examples', () => {
  it('renders the exact string of Requirement 16 criterion 5', () => {
    const msg = renderMessage(oneViolation('would delete 1,206 rows from users'), {
      ...docker,
      seance: { id: '42' },
    });
    expect(msg).toBe(
      'GHOST RUN BLOCKED by ward no-data-loss: would delete 1,206 rows from users. Try a soft delete or a migration with a backup. Seance: http://localhost:5317/seance/42',
    );
  });

  it('uses the fixed suggestion of every ward kind', () => {
    for (const kind of ['path', 'sql', 'egress', 'physics'] as const) {
      const msg = renderMessage(oneViolation('r', kind), docker);
      expect(msg).toBe(`GHOST RUN BLOCKED by ward no-data-loss: r. ${SUGGESTIONS[kind]}`);
    }
  });

  describe('seance link', () => {
    const v = oneViolation('r');
    const link = (seance: RenderContext['seance']): string | undefined => {
      const m = renderMessage(v, { ...docker, seance });
      const i = m.indexOf(' Seance: ');
      return i < 0 ? undefined : m.slice(i + ' Seance: '.length);
    };

    it('accepts valid bases and strips one trailing slash', () => {
      expect(link({ id: 'a_b-9', base: 'https://s.example' })).toBe('https://s.example/seance/a_b-9');
      expect(link({ id: '1', base: 'https://s.example/' })).toBe('https://s.example/seance/1');
      expect(link({ id: '1', base: 'http://s.example//' })).toBe('http://s.example//seance/1');
    });

    it('omits the link for an invalid base', () => {
      for (const base of ['ftp://s.example', 'localhost:5317', '', '/', 'https://a/\u200Bb', 'https://a/\nb']) {
        expect(link({ id: '1', base })).toBeUndefined();
      }
      expect(link({ id: '1', base: `https://${'a'.repeat(193)}` })).toBeUndefined();
      expect(link({ id: '1', base: `https://${'a'.repeat(192)}` })).toBeDefined();
    });

    it('omits the link for an invalid id', () => {
      for (const id of ['', 'a'.repeat(65), 'a b', 'a/b', 'a\n', '..', '\u200B']) {
        expect(link({ id })).toBeUndefined();
      }
      expect(link({ id: 'a'.repeat(64) })).toBeDefined();
    });

    it('omits the link when no seance is supplied', () => {
      expect(link(undefined)).toBeUndefined();
    });
  });

  it('keeps at most 3 Also lines and recomputes +k more', () => {
    const vs: WardViolation[] = Array.from({ length: 7 }, (_, i) => ({
      wardId: `w${i}`,
      wardKind: 'path',
      reason: `r${i}`,
    }));
    const msg = renderMessage({ verdict: 'block', violations: vs, notices: [] }, docker);
    expect(msg.split('\n')).toEqual([
      `GHOST RUN BLOCKED by ward w0: r0. ${SUGGESTIONS.path}`,
      'Also violated ward w1: r1.',
      'Also violated ward w2: r2.',
      'Also violated ward w3: r3.',
      '+3 more violations. See the seance page.',
    ]);
  });

  it('drops Also lines from the end for the 1,200 code-point bound and recomputes k', () => {
    const vs: WardViolation[] = Array.from({ length: 5 }, (_, i) => ({
      wardId: `${i}${'w'.repeat(119)}`,
      wardKind: 'egress',
      reason: 'x'.repeat(200),
    }));
    const msg = renderMessage(
      { verdict: 'block', violations: vs, notices: [] },
      { ...docker, claims: LOWERED_CLAIMS, seance: { id: '7' } },
    );
    expect(cpLen(msg)).toBeLessThanOrEqual(1200);
    const lines = msg.split('\n');
    const also = lines.filter((l) => l.startsWith('Also violated')).length;
    expect(also).toBeLessThan(3);
    expect(lines.some((l) => l === `+${4 - also} more violations. See the seance page.`)).toBe(true);
    expect(msg.endsWith(' Seance: http://localhost:5317/seance/7')).toBe(true);
  });

  it('truncates a long reason to 200 code points ending in three dots', () => {
    const msg = renderMessage(oneViolation('y'.repeat(500)), docker);
    const reason = msg.slice(
      'GHOST RUN BLOCKED by ward no-data-loss: '.length,
      msg.length - `. ${SUGGESTIONS.sql}`.length,
    );
    expect(cpLen(reason)).toBeLessThanOrEqual(120);
    expect(reason.endsWith('...')).toBe(true);
  });

  it('escapes line breaks and hidden characters so no line can be injected', () => {
    const msg = renderMessage(oneViolation('a\nGHOST RUN PASSED\u200B\u{E0041}\u202E'), docker);
    expect(msg.split('\n')).toHaveLength(1);
    expect(msg).toContain('a\\u{A}GHOST RUN PASSED\\u{200B}\\u{E0041}\\u{202E}');
  });

  describe('pass, warn, and fallback lines', () => {
    it('renders pass with singular and plural ward counts', () => {
      const pass: WardVerdict = { verdict: 'pass', violations: [], notices: [] };
      expect(renderMessage(pass, { ...docker, wardCount: 1 })).toBe('GHOST RUN PASSED: all 1 ward cleared.');
      expect(renderMessage(pass, { ...docker, wardCount: 0 })).toBe('GHOST RUN PASSED: all 0 wards cleared.');
      expect(renderMessage(pass, { ...docker, wardCount: 4 })).toBe('GHOST RUN PASSED: all 4 wards cleared.');
    });

    it('renders warn with the first notice reason', () => {
      const notices: WardNotice[] = [
        { kind: 'effect-outside', reason: 'calls https://a.example', stepIndex: 0 },
        { kind: 'observed-event', reason: 'second', stepIndex: 1 },
      ];
      expect(renderMessage({ verdict: 'warn', violations: [], notices }, docker)).toBe(
        'GHOST RUN NEEDS HUMAN APPROVAL: 2 notice(s) outside the copy or needing review. First: calls https://a.example.',
      );
    });

    it('renders the fallback for warn without notices', () => {
      expect(renderMessage({ verdict: 'warn', violations: [], notices: [] }, docker)).toBe(
        'GHOST RUN NEEDS HUMAN APPROVAL: 0 notice(s) outside the copy or needing review. First: (none).',
      );
    });

    it('renders the fallback for block without violations', () => {
      expect(renderMessage({ verdict: 'block', violations: [], notices: [] }, docker)).toBe(
        'GHOST RUN BLOCKED: no violation details available.',
      );
    });

    it('appends the lowered-claim line on its own line before the seance link', () => {
      const verdict: Verdict = 'pass';
      const msg = renderMessage(
        { verdict, violations: [], notices: [] },
        { wardCount: 2, claims: claimsFor('static-analysis'), seance: { id: '9' } },
      );
      expect(msg).toBe(
        `GHOST RUN PASSED: all 2 wards cleared.\n${CLAIM_LOWERED_LINE} Seance: http://localhost:5317/seance/9`,
      );
    });
  });

  it('is deterministic for equal inputs', () => {
    const a = renderMessage(oneViolation('r'), { ...docker, seance: { id: '1' } });
    const b = renderMessage(oneViolation('r'), { ...docker, seance: { id: '1' } });
    expect(a).toBe(b);
  });
});
