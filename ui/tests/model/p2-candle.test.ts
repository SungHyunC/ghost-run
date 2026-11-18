// Feature: ui-kit, Property 2: Candle mapping (model leg, tag UI-P2).
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { buildCandleModel, type CandleModel } from '../../src/model/candle';
import { escapeForDisplay, isHiddenDisplay } from '../../src/model/escape';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';
import { dirtyString } from '../fixtures/arbitraries';

console.log(`UI-P2 model leg seed=${PBT_SEED}`);

const KNOWN_VERDICTS = ['pass', 'warn', 'block'] as const;
const STATE_OF: Record<string, string> = { pass: 'lit', warn: 'flickering', block: 'out' };

type Rec = Record<string, unknown>;

// ---- generators -----------------------------------------------------------

const idArb = fc.oneof(
  fc.constantFrom('no-delete', 'keep-users', 'ward-a', 'ward-b'),
  dirtyString(fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/)),
);
const kindArb = fc.oneof(fc.constantFrom('path', 'sql', 'egress', 'physics'), dirtyString(fc.string({ maxLength: 8 })));
const reasonArb = dirtyString(fc.string({ maxLength: 40 }));

/** Unrelated fields use a prefix that no model field reads. */
const extraFields: fc.Arbitrary<Rec> = fc
  .dictionary(fc.stringMatching(/^x-[a-z]{1,8}$/), fc.oneof(fc.string({ maxLength: 10 }), fc.integer(), fc.boolean(), fc.constant(null)), {
    maxKeys: 3,
  });

const violationArb = fc
  .tuple(idArb, kindArb, reasonArb, extraFields)
  .map(([wardId, wardKind, reason, extra]) => ({ ...extra, wardId, wardKind, reason }) as Rec);

/** Notice kinds: known ones, kinds beyond them, and arbitrary strings. */
const noticeKindArb = fc.oneof(
  fc.constantFrom('effect-outside', 'observed-event'),
  fc.constantFrom('unsupported-step', 'path-escape', 'content-inspection'),
  fc.string({ maxLength: 20 }),
  dirtyString(fc.string({ maxLength: 12 })),
);

const noticeArb = fc
  .tuple(noticeKindArb, reasonArb, fc.nat({ max: 50 }), extraFields)
  .map(([kind, reason, stepIndex, extra]) => ({ ...extra, kind, reason, stepIndex }) as Rec);

const unknownVerdictValue: fc.Arbitrary<unknown> = fc.oneof(
  dirtyString(fc.string({ maxLength: 100 })).filter((s) => !(KNOWN_VERDICTS as readonly string[]).includes(s)),
  fc.string({ minLength: 41, maxLength: 120 }).filter((s) => !(KNOWN_VERDICTS as readonly string[]).includes(s)),
  fc.constantFrom('PASS', 'Pass ', 'blocked', '', 'toString', '__proto__', 'constructor'),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
);

type VerdictCase =
  | { cls: 'known'; verdict: (typeof KNOWN_VERDICTS)[number]; input: Rec; violations: Rec[]; notices: Rec[] }
  | { cls: 'unknown'; value: unknown; input: Rec; violations: Rec[]; notices: Rec[] }
  | { cls: 'absent' | 'undefinedValue'; input: Rec; violations: Rec[]; notices: Rec[] };

const verdictCase: fc.Arbitrary<VerdictCase> = fc
  .tuple(
    fc.oneof(
      { weight: 6, arbitrary: fc.constantFrom('known' as const) },
      { weight: 3, arbitrary: fc.constantFrom('unknown' as const) },
      { weight: 1, arbitrary: fc.constantFrom('absent' as const) },
      { weight: 1, arbitrary: fc.constantFrom('undefinedValue' as const) },
    ),
    fc.constantFrom(...KNOWN_VERDICTS),
    unknownVerdictValue,
    fc.oneof(fc.constant<Rec[]>([]), fc.array(violationArb, { maxLength: 12 })),
    fc.oneof(fc.constant<Rec[]>([]), fc.array(noticeArb, { maxLength: 12 })),
    extraFields,
  )
  .map(([cls, verdict, value, violations, notices, extra]): VerdictCase => {
    const base: Rec = { ...extra, violations, notices };
    if (cls === 'known') return { cls, verdict, input: { ...base, verdict }, violations, notices };
    if (cls === 'unknown') return { cls, value, input: { ...base, verdict: value }, violations, notices };
    if (cls === 'undefinedValue') return { cls, input: { ...base, verdict: undefined }, violations, notices };
    return { cls, input: base, violations, notices };
  });

// ---- oracle ---------------------------------------------------------------

const esc = (v: unknown): string =>
  typeof v === 'string' ? escapeForDisplay(v, { keepNewline: true }) : String(v);

function expectedState(c: VerdictCase): string {
  if (c.cls === 'known') return STATE_OF[c.verdict] as string;
  if (c.cls === 'unknown') return 'unknown';
  return 'idle';
}

function ok(input: unknown): CandleModel {
  const m = buildCandleModel(input);
  if (m.kind !== 'ok') throw new Error('unreadable');
  return m;
}

function assertCandle(c: VerdictCase): CandleModel {
  const m = ok(c.input);
  const state = expectedState(c);

  // Exactly one state, chosen by `verdict` alone.
  expect(m.state).toBe(state);

  // Distinct ward lines in first-appearance order; violation lines in input order.
  const seen: string[] = [];
  const wardLines: string[] = [];
  for (const v of c.violations) {
    const id = esc(v['wardId']);
    if (!seen.includes(id)) {
      seen.push(id);
      wardLines.push(`Violated ward: ${id} (${esc(v['wardKind'])})`);
    }
  }
  if (state === 'out' && wardLines.length === 0) wardLines.push('Violated ward: none reported');
  expect(m.wardLines).toEqual(wardLines);
  expect(m.violationItems).toEqual(c.violations.map((v) => ({ text: `${esc(v['wardId'])}: ${esc(v['reason'])}` })));

  // Every notice line is `step <n>: <reason>` regardless of kind.
  expect(m.noticeItems).toEqual(c.notices.map((n) => ({ text: `step ${String(n['stepIndex'])}: ${esc(n['reason'])}` })));

  // Summary only for warn.
  if (state === 'flickering') expect(m.noticeSummary).toBe(`${c.notices.length} notices need review`);
  else expect(m.noticeSummary).toBeUndefined();

  // Pass with violations stays lit with the inconsistency text.
  if (state === 'lit' && c.violations.length > 0) {
    expect(m.inconsistency).toBe('Data inconsistent: pass verdict with violations.');
  } else expect(m.inconsistency).toBeUndefined();

  // Unknown values are never lit and are escaped to at most 40 code points.
  if (c.cls === 'unknown') {
    expect(m.state).not.toBe('lit');
    const text = m.unknownValueText ?? '';
    expect(m.unknownValueText).toBeDefined();
    const cps = Array.from(text);
    expect(cps.length).toBeLessThanOrEqual(40);
    for (const ch of cps) expect(isHiddenDisplay(ch.codePointAt(0) ?? 0)).toBe(false);
  } else expect(m.unknownValueText).toBeUndefined();

  // Unrelated fields change nothing.
  const stripped: Rec = { violations: c.violations.map(strip), notices: c.notices.map(strip) };
  if (c.cls === 'known') stripped['verdict'] = c.verdict;
  else if (c.cls === 'unknown') stripped['verdict'] = c.value;
  expect(ok(stripped)).toEqual(m);
  return m;
}

function strip(r: Rec): Rec {
  const out: Rec = {};
  for (const k of Object.keys(r)) if (!k.startsWith('x-')) out[k] = r[k];
  return out;
}

// ---- tests ----------------------------------------------------------------

describe('UI-P2 model leg: candle mapping', () => {
  it('maps any verdict input to one state with the specified lines and texts', () => {
    const counter = createCounter('UI-P2 candle');
    fc.assert(
      fc.property(verdictCase, (c) => {
        const m = assertCandle(c);
        counter.add(`state:${m.state}`);
        counter.add(c.violations.length === 0 ? 'violations:none' : 'violations:some');
        counter.add(c.notices.length === 0 ? 'notices:none' : 'notices:some');
        if (c.notices.some((n) => !['effect-outside', 'observed-event'].includes(String(n['kind'])))) {
          counter.add('notices:extraKind');
        }
        if (new Set(c.violations.map((v) => v['wardId'])).size < c.violations.length) counter.add('wardRepeated');
        if (m.state === 'lit' && c.violations.length > 0) counter.add('inconsistent');
        if (m.state === 'out' && c.violations.length === 0) counter.add('blockNoViolations');
        if (c.cls === 'unknown') counter.add(`unknownType:${c.value === null ? 'null' : typeof c.value}`);
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
      'unknownType:string',
      'unknownType:number',
      'unknownType:boolean',
    ]);
  }, PBT_TIMEOUT);

  it('an absent verdict, an undefined verdict value, and an undefined input give idle', () => {
    fc.assert(
      fc.property(extraFields, fc.array(violationArb, { maxLength: 3 }), (extra, violations) => {
        expect(ok(undefined).state).toBe('idle');
        expect(ok({ ...extra, violations }).state).toBe('idle');
        expect(ok({ ...extra, violations, verdict: undefined }).state).toBe('idle');
      }),
      params('full'),
    );
  }, PBT_TIMEOUT);

  it('regression: unknown notice kinds render like known ones', () => {
    const m = ok({
      verdict: 'warn',
      violations: [],
      notices: ['unsupported-step', 'path-escape', 'content-inspection', 'zzz', ''].map((kind, i) => ({
        kind,
        reason: 'r',
        stepIndex: i,
      })),
    });
    expect(m.noticeItems).toEqual([0, 1, 2, 3, 4].map((i) => ({ text: `step ${i}: r` })));
    expect(m.noticeSummary).toBe('5 notices need review');
  });
});
