import { describe, expect, it } from 'vitest';
import { buildClaimModel } from '../../src/model/claims';

const base = { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true };

describe('buildClaimModel', () => {
  it('all claimed: assurance only', () => {
    const m = buildClaimModel(base);
    expect(m.assuranceText).toBe('Ghost ran inside a sealed Docker box (P1 claimed).');
    expect(m.notClaimedBanner).toBeNull();
    expect(m.staticBanner).toBeNull();
  });

  it('playground text and both conditions together', () => {
    const m = buildClaimModel({ ...base, mode: 'playground', p6Claimed: false });
    expect(m.assuranceText).toContain('in-memory');
    expect(m.notClaimedBanner).toBe('Not claimed for this run: P6.');
  });

  it('unclaimed P1 removes assurance', () => {
    const m = buildClaimModel({ ...base, p1Claimed: false, p5Claimed: 'true' });
    expect(m.assuranceText).toBeNull();
    expect(m.notClaimedBanner).toBeTruthy();
  });

  it('static-analysis ignores booleans and only accepts enum reasons', () => {
    const a = buildClaimModel({ ...base, mode: 'static-analysis', reason: 'docker-unavailable' });
    expect(a.staticBanner).toMatch(/ Reason: Docker unavailable\.$/);
    expect(a.lines.every((l) => !l.claimed)).toBe(true);
    expect(a.notClaimedBanner).toBeNull();
    expect(buildClaimModel({ ...base, mode: 'static-analysis', reason: 'other' }).staticBanner).not.toMatch(/Reason/);
  });

  it('absent or malformed claims are unknown', () => {
    for (const c of [undefined, 5, { mode: 'weird' }, { ...base, p1Claimed: 1 }]) {
      const m = buildClaimModel(c);
      expect(m.unknownStatus).toBe(true);
      expect(m.notClaimedBanner).toBe('Isolation status unknown. Not claimed for this run: P1, P5, P6.');
      expect(m.assuranceText).toBeNull();
    }
  });
});
