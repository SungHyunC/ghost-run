// Feature: ui-kit, Property 2: Candle mapping (static markup leg, tag UI-P2).
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { Candle } from '../../src/components/Candle';
import { escapeForDisplay, isHiddenDisplay } from '../../src/model/escape';
import { dirtyString } from '../fixtures/arbitraries';
import { renderMarkup, escapeHtml } from '../support/markup';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

const KNOWN = ['pass', 'warn', 'block'] as const;

type Rec = Record<string, unknown>;

const EXPECTED: Record<string, { state: string; icon: string; text: string; accessible: string }> = {
  lit: { state: 'lit', icon: 'candle-lit', text: 'PASS', accessible: 'Candle lit: pass. All wards cleared.' },
  flickering: {
    state: 'flickering',
    icon: 'candle-flicker',
    text: 'WARN',
    accessible: 'Candle flickering: warn. Human approval needed.',
  },
  out: { state: 'out', icon: 'candle-out', text: 'BLOCK', accessible: 'Candle out: block.' },
  unknown: {
    state: 'unknown',
    icon: 'candle-unknown',
    text: 'UNKNOWN',
    accessible: 'Candle state unknown: verdict not recognized.',
  },
  idle: { state: 'idle', icon: 'candle-idle', text: 'NO VERDICT', accessible: 'No verdict yet.' },
};
const STATE_OF: Record<string, string> = { pass: 'lit', warn: 'flickering', block: 'out' };

// ---- generators -----------------------------------------------------------

const idArb = fc.oneof(
  fc.constantFrom('no-delete', 'keep-users', 'ward-a', 'ward-b'),
  dirtyString(fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/)),
);
const kindArb = fc.oneof(fc.constantFrom('path', 'sql', 'egress', 'physics'), dirtyString(fc.string({ maxLength: 8 })));
const reasonArb = dirtyString(fc.string({ maxLength: 40 }));

const extraFields: fc.Arbitrary<Rec> = fc.dictionary(
  fc.stringMatching(/^x-[a-z]{1,8}$/),
  fc.oneof(fc.string({ maxLength: 10 }), fc.integer(), fc.boolean(), fc.constant(null)),
  { maxKeys: 3 },
);

const violationArb = fc
  .tuple(idArb, kindArb, reasonArb, extraFields)
  .map(([wardId, wardKind, reason, extra]) => ({ ...extra, wardId, wardKind, reason }) as Rec);

/** Known notice kinds, kinds beyond them, and arbitrary strings. */
const noticeKindArb = fc.oneof(
  fc.constantFrom('effect-outside', 'observed-event'),
  fc.constantFrom('unsupported-step', 'path-escape', 'content-inspection'),
  fc.string({ maxLength: 20 }),
  dirtyString(fc.string({ maxLength: 12 })),
);
const noticeArb = fc
  .tuple(noticeKindArb, reasonArb, fc.nat({ max: 50 }), extraFields)
  .map(([kind, reason, stepIndex, extra]) => ({ ...extra, kind, reason, stepIndex }) as Rec);

const unknownValue: fc.Arbitrary<unknown> = fc.oneof(
  dirtyString(fc.string({ maxLength: 100 })).filter((s) => !(KNOWN as readonly string[]).includes(s)),
  fc.string({ minLength: 41, maxLength: 120 }).filter((s) => !(KNOWN as readonly string[]).includes(s)),
  fc.constantFrom('PASS', 'Pass ', 'blocked', '', 'toString', '__proto__', 'constructor'),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
);

type Case = {
  cls: 'known' | 'unknown' | 'absent' | 'undefinedValue';
  value: unknown;
  input: Rec;
  violations: Rec[];
  notices: Rec[];
};

const caseArb: fc.Arbitrary<Case> = fc
  .tuple(
    fc.oneof(
      { weight: 6, arbitrary: fc.constantFrom('known' as const) },
      { weight: 3, arbitrary: fc.constantFrom('unknown' as const) },
      { weight: 1, arbitrary: fc.constantFrom('absent' as const) },
      { weight: 1, arbitrary: fc.constantFrom('undefinedValue' as const) },
    ),
    fc.constantFrom(...KNOWN),
    unknownValue,
    fc.oneof(fc.constant<Rec[]>([]), fc.array(violationArb, { maxLength: 12 })),
    fc.oneof(fc.constant<Rec[]>([]), fc.array(noticeArb, { maxLength: 12 })),
    extraFields,
  )
  .map(([cls, verdict, value, violations, notices, extra]): Case => {
    const base: Rec = { ...extra, violations, notices };
    if (cls === 'known') return { cls, value: verdict, input: { ...base, verdict }, violations, notices };
    if (cls === 'unknown') return { cls, value, input: { ...base, verdict: value }, violations, notices };
    if (cls === 'undefinedValue') return { cls, value: undefined, input: { ...base, verdict: undefined }, violations, notices };
    return { cls, value: undefined, input: base, violations, notices };
  });

// ---- oracle ---------------------------------------------------------------

const esc = (v: unknown): string => (typeof v === 'string' ? escapeForDisplay(v, { keepNewline: true }) : String(v));
const h = (v: unknown): string => escapeHtml(esc(v));

function renderCandle(input: unknown, extraProps: Rec = {}): string {
  const props = { verdict: input, ...extraProps } as unknown as Parameters<typeof Candle>[0];
  return renderMarkup(<Candle {...props} />);
}

function expectedState(c: Case): string {
  if (c.cls === 'known') return STATE_OF[c.value as string] as string;
  if (c.cls === 'unknown') return 'unknown';
  return 'idle';
}

function listItems(html: string, label: string): string[] | null {
  const m = new RegExp(`<ul[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</ul>`).exec(html);
  if (m === null) return null;
  return [...(m[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1] ?? '');
}

function check(c: Case): string {
  const html = renderCandle(c.input);
  const state = expectedState(c);
  const exp = EXPECTED[state] as (typeof EXPECTED)[string];

  // Exactly one state with its icon, text label, and accessible label.
  expect([...html.matchAll(/data-candle-state="/g)]).toHaveLength(1);
  expect(html).toContain(`data-candle-state="${exp.state}"`);
  expect(html).toContain(`aria-label="${exp.accessible}"`);
  expect(html).toContain(`<div role="status" aria-live="polite" class="gk-sr-only">${exp.accessible}</div>`);
  const label = /<p class="gk-candle-label">([\s\S]*?)<\/p>/.exec(html);
  expect(label).not.toBeNull();
  expect(label?.[1]).toContain(`data-icon="${exp.icon}"`);
  expect(label?.[1]).toContain(`<span>${exp.text}</span>`);
  const candleIcons = [...html.matchAll(/data-icon="(candle-[a-z]+)"/g)].map((x) => x[1]);
  expect(candleIcons.length).toBeGreaterThanOrEqual(1);
  for (const id of candleIcons) expect(id).toBe(exp.icon);
  for (const other of Object.values(EXPECTED)) {
    if (other.state !== state) {
      expect(html).not.toContain(`aria-label="${other.accessible}"`);
      expect(html).not.toContain(`<span>${other.text}</span>`);
    }
  }

  // Ward lines: distinct ids in first-appearance order.
  const seen: string[] = [];
  const wardLines: string[] = [];
  for (const v of c.violations) {
    const id = esc(v['wardId']);
    if (!seen.includes(id)) {
      seen.push(id);
      wardLines.push(escapeHtml(`Violated ward: ${id} (${esc(v['wardKind'])})`));
    }
  }
  if (state === 'out' && wardLines.length === 0) wardLines.push('Violated ward: none reported');
  expect(listItems(html, 'Wards') ?? []).toEqual(wardLines);

  // Violation lines in input order; notice lines are `step <n>: <reason>` whatever the kind.
  expect(listItems(html, 'Violations') ?? []).toEqual(c.violations.map((v) => `${h(v['wardId'])}: ${h(v['reason'])}`));
  expect(listItems(html, 'Notices') ?? []).toEqual(c.notices.map((n) => `step ${String(n['stepIndex'])}: ${h(n['reason'])}`));

  // Warn summary; pass-with-violations inconsistency; neither elsewhere.
  const summary = `${c.notices.length} notices need review`;
  expect(html.includes(`<p class="gk-warn">${summary}</p>`)).toBe(state === 'flickering');
  const inconsistent = '<p class="gk-warn">Data inconsistent: pass verdict with violations.</p>';
  expect(html.includes(inconsistent)).toBe(state === 'lit' && c.violations.length > 0);

  // Unknown-state rules: never lit, value escaped and at most 40 code points.
  const unknownP = /<p class="gk-mono">([\s\S]*?)<\/p>/.exec(html);
  if (state === 'unknown') {
    expect(html).not.toContain('data-candle-state="lit"');
    expect(unknownP).not.toBeNull();
    const text = unescapeHtml(unknownP?.[1] ?? '');
    const cps = Array.from(text);
    expect(cps.length).toBeLessThanOrEqual(40);
    for (const ch of cps) expect(isHiddenDisplay(ch.codePointAt(0) ?? 0)).toBe(false);
  } else expect(unknownP).toBeNull();

  // Unrelated fields do not change the markup.
  const stripped: Rec = {
    violations: c.violations.map(strip),
    notices: c.notices.map(strip),
  };
  if (c.cls === 'known' || c.cls === 'unknown') stripped['verdict'] = c.value;
  expect(renderCandle(stripped)).toBe(html);

  // needles, links, findings, entries next to the verdict change nothing.
  const sidecar = { needles: [{ value: 'x.example', origin: 'effect', stepIndex: 1 }], links: [{ status: 'not-found' }], findings: [{}], entries: [{ id: 'e' }] };
  expect(renderCandle({ ...c.input, ...sidecar })).toBe(html);
  expect(renderCandle(c.input, sidecar)).toBe(html);
  return state;
}

function unescapeHtml(s: string): string {
  return s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function strip(r: Rec): Rec {
  const out: Rec = {};
  for (const k of Object.keys(r)) if (!k.startsWith('x-')) out[k] = r[k];
  return out;
}

// ---- test -----------------------------------------------------------------

describe('UI-P2 static leg: candle mapping', () => {
  it(
    'UI-P2 renders one candle state with icon, labels, ward, violation, and notice lines',
    () => {
      const counter = createCounter('UI-P2 static candle');
      console.log(`PBT seed=${PBT_SEED}`);
      fc.assert(
        fc.property(caseArb, (c) => {
          const state = check(c);
          counter.add(`state:${state}`);
          counter.add(c.violations.length === 0 ? 'violations:none' : 'violations:some');
          counter.add(c.notices.length === 0 ? 'notices:none' : 'notices:some');
          if (c.notices.some((n) => !['effect-outside', 'observed-event'].includes(String(n['kind'])))) {
            counter.add('notices:extraKind');
          }
          if (new Set(c.violations.map((v) => v['wardId'])).size < c.violations.length) counter.add('wardRepeated');
          if (state === 'lit' && c.violations.length > 0) counter.add('inconsistent');
          if (state === 'out' && c.violations.length === 0) counter.add('blockNoViolations');
        }),
        params('full'),
      );
      counter.print();
      assertBucketsHit(counter, [
        'state:lit',
        'state:flickering',
        'state:out',
        'state:unknown',
        'state:idle',
        'violations:none',
        'violations:some',
        'notices:none',
        'notices:some',
        'notices:extraKind',
        'wardRepeated',
        'inconsistent',
        'blockNoViolations',
      ]);
    },
    PBT_TIMEOUT,
  );

  it('regression: notice kinds beyond the known ones render as step lines', () => {
    const html = renderCandle({
      verdict: 'warn',
      violations: [],
      notices: ['unsupported-step', 'path-escape', 'content-inspection', 'zzz', ''].map((kind, i) => ({ kind, reason: 'r', stepIndex: i })),
    });
    expect(listItems(html, 'Notices')).toEqual([0, 1, 2, 3, 4].map((i) => `step ${i}: r`));
    expect(html).toContain('5 notices need review');
  });
});
