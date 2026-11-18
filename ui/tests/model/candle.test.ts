import { describe, expect, it } from 'vitest';
import { buildCandleModel, type CandleModel } from '../../src/model/candle';

function ok(v: unknown): CandleModel {
  const m = buildCandleModel(v);
  if (m.kind !== 'ok') throw new Error('unreadable');
  return m;
}

describe('buildCandleModel', () => {
  it('maps verdicts to states', () => {
    expect(ok({ verdict: 'pass', violations: [], notices: [] }).state).toBe('lit');
    expect(ok({ verdict: 'warn', violations: [], notices: [] }).state).toBe('flickering');
    expect(ok({ verdict: 'block', violations: [], notices: [] }).state).toBe('out');
    expect(ok(undefined).state).toBe('idle');
  });

  it('dedupes ward lines and renders every notice kind-agnostically', () => {
    const m = ok({
      verdict: 'warn',
      violations: [
        { wardId: 'a', wardKind: 'path', reason: 'r1' },
        { wardId: 'a', wardKind: 'path', reason: 'r2' },
        { wardId: 'b', wardKind: 'sql', reason: 'r3' },
      ],
      notices: [
        { kind: 'effect-outside', reason: 'x', stepIndex: 2 },
        { kind: 'made-up-kind', reason: 'y', stepIndex: 0 },
      ],
    });
    expect(m.wardLines).toEqual(['Violated ward: a (path)', 'Violated ward: b (sql)']);
    expect(m.noticeItems).toEqual([{ text: 'step 2: x' }, { text: 'step 0: y' }]);
    expect(m.noticeSummary).toBe('2 notices need review');
  });

  it('handles block without violations, pass with violations, unknown value, unreadable items', () => {
    expect(ok({ verdict: 'block', violations: [], notices: [] }).wardLines).toEqual(['Violated ward: none reported']);
    const p = ok({ verdict: 'pass', violations: [{ wardId: 'a', wardKind: 'path', reason: 'r' }], notices: [] });
    expect(p.state).toBe('lit');
    expect(p.inconsistency).toBe('Data inconsistent: pass verdict with violations.');
    const u = ok({ verdict: 'x'.repeat(100) + '\u200B', violations: [3], notices: [] });
    expect(u.state).toBe('unknown');
    expect(Array.from(u.unknownValueText ?? '').length).toBeLessThanOrEqual(40);
    expect(u.violationItems).toEqual([{ unreadableIndex: 0 }]);
    expect(buildCandleModel('nope').kind).toBe('unreadable');
  });

  it('never says approved or safe', () => {
    for (const v of ['pass', 'warn', 'block', 'zzz']) {
      const m = ok({ verdict: v, violations: [], notices: [] });
      expect(`${m.textLabel} ${m.accessibleLabel}`).not.toMatch(/approved|safe/i);
    }
  });
});
