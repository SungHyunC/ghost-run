import { describe, expect, it } from 'vitest';
import { parseSeedInput, validateVariantCount } from '../../src/inputs.js';

describe('parseSeedInput', () => {
  it('accepts decimal integers in range', () => {
    expect(parseSeedInput('0')).toEqual({ ok: true, seed: 0 });
    expect(parseSeedInput('42')).toEqual({ ok: true, seed: 42 });
    expect(parseSeedInput('4294967295')).toEqual({ ok: true, seed: 4294967295 });
  });
  it.each(['', '-1', '+1', ' 1', '1 ', '1e3', '1.0', '0x10', '4294967296', '\u0661', '9'.repeat(400)])(
    'rejects %j with a message',
    (text) => {
      const r = parseSeedInput(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    },
  );
});

describe('validateVariantCount', () => {
  const base = { defaultCount: 8, maxCount: 20, largeCountEnabled: false };
  it('accepts 1..defaultCount, rejects beyond when large counts are off', () => {
    expect(validateVariantCount(1, base).ok).toBe(true);
    expect(validateVariantCount(8, base).ok).toBe(true);
    expect(validateVariantCount(9, base).ok).toBe(false);
    expect(validateVariantCount(0, base).ok).toBe(false);
  });
  it('accepts up to maxCount when large counts are on', () => {
    const on = { ...base, largeCountEnabled: true };
    expect(validateVariantCount(20, on).ok).toBe(true);
    expect(validateVariantCount(21, on).ok).toBe(false);
  });
  it('rejects non-integers with a message', () => {
    for (const n of [1.5, NaN, Infinity]) {
      const r = validateVariantCount(n, base);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    }
  });
});
