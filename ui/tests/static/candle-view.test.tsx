import { describe, expect, it } from 'vitest';
import { CandleView } from '../../src/components/Candle';
import { buildCandleModel } from '../../src/model/candle';
import { buildClaimModel } from '../../src/model/claims';
import { renderMarkup } from '../support/markup';

function render(verdict: unknown, claims: unknown): string {
  const model = buildCandleModel(verdict);
  if (model.kind !== 'ok') throw new Error('unreadable');
  return renderMarkup(<CandleView model={model} claims={buildClaimModel(claims)} />);
}

describe('candle view (static)', () => {
  it('renders a block verdict with ward, violation, and claim lines', () => {
    const html = render(
      { verdict: 'block', violations: [{ wardId: 'protect-env', wardKind: 'path', reason: 'delete of .env' }], notices: [] },
      { mode: 'playground', p1Claimed: true, p5Claimed: true, p6Claimed: false, notApplicable: [] },
    );
    expect(html).toContain('data-candle-state="out"');
    expect(html).toContain('aria-label="Candle out: block."');
    expect(html).toContain('role="status"');
    expect(html).toContain('BLOCK');
    expect(html).toContain('protect-env');
    expect(html).toContain('gk-claim-claimed');
    expect(html).toContain('gk-claim-not-claimed');
    expect(html).toContain('data-claim="assurance"');
    expect(html).toContain('data-claim="not-claimed"');
    expect(html).not.toMatch(/approved|safe/i);
  });

  it('renders not-applicable lines and the static banner paragraph', () => {
    const na = render({ verdict: 'pass' }, { mode: 'playground', p1Claimed: true, p5Claimed: false, p6Claimed: false, notApplicable: ['P5', 'P6'] });
    expect(na).toContain('gk-claim-not-applicable');
    expect(na).toContain('P5: not applicable to this world');
    expect(na).toContain('P6: not applicable to this world');
    expect(na).not.toContain('data-claim="not-claimed"');

    const st = render({ verdict: 'warn', notices: [{ stepIndex: 1, kind: 'x', reason: 'network' }] }, { mode: 'static-analysis', reason: 'docker-unavailable' });
    expect(st).toContain('data-claim="static"');
    expect(st).not.toContain('data-claim="assurance"');
    expect(st).toContain('step 1: network');
  });
});
