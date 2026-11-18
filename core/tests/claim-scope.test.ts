import { describe, expect, it } from 'vitest';
import { claimLabel, claimsFor, describeClaimed } from './fixtures/claim-scope.js';

describe('claimsFor', () => {
  it('claims neither P5 nor P6 for static-analysis', () => {
    expect(claimsFor('static-analysis')).toEqual({ p5: false, p6: false });
  });

  it('claims both for docker-box and playground', () => {
    expect(claimsFor('docker-box')).toEqual({ p5: true, p6: true });
    expect(claimsFor('playground')).toEqual({ p5: true, p6: true });
  });
});

describe('claimLabel', () => {
  it('contains the declared scope', () => {
    expect(claimLabel('P4')).toContain('all worlds');
    expect(claimLabel('P5')).toContain('P1 holds');
    expect(claimLabel('P6')).toContain('network attempts are recorded');
  });
});

describeClaimed('P5', () => {
  it('runs the body inside the labeled suite', () => {
    expect(true).toBe(true);
  });
});
