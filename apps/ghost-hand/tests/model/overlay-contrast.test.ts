// Overlay contrast check. **Validates: Requirement 13.9**
import { describe, expect, it } from 'vitest';
import {
  OVERLAY_CONTRAST_PAIRS,
  type OverlayTheme,
} from '../../src/overlay/overlay-tokens.js';
import { contrastRatio, MIN_RATIO } from '../../src/overlay/wcag.js';

/** Independent luminance code, written separately from wcag.ts. */
function lum(hex: string): number {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const ch = [0, 2, 4].map((i) => {
    const s = parseInt(full.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (ch[0] as number) + 0.7152 * (ch[1] as number) + 0.0722 * (ch[2] as number);
}
function ratio(a: string, b: string): number {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('wcag.ts sanity', () => {
  it('black on white is 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 10);
  });
  it('is symmetric and at least 1', () => {
    const colors = ['#000000', '#ffffff', '#14111c', '#faf7f2', '#ff8585', '#7a7390', '#777'];
    for (const a of colors) {
      expect(contrastRatio(a, a)).toBeCloseTo(1, 10);
      for (const b of colors) {
        expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 12);
        expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(1);
      }
    }
  });
  it('matches hand-computed reference values', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2); // 1.05 / (0.1845 + 0.05)
    expect(contrastRatio('#ff0000', '#ffffff')).toBeCloseTo(4.0, 2); // 1.05 / (0.2126 + 0.05)
    expect(contrastRatio('#808080', '#ffffff')).toBeCloseTo(3.95, 2);
  });
});

describe('overlay token contrast (Requirement 13.9)', () => {
  const themes: OverlayTheme[] = ['dark', 'light'];
  for (const theme of themes) {
    it(`every ${theme} pair meets its minimum ratio`, () => {
      const pairs = OVERLAY_CONTRAST_PAIRS[theme];
      expect(pairs.length).toBeGreaterThan(0);
      for (const p of pairs) {
        const min = p.role === 'text' ? 4.5 : 3;
        expect(MIN_RATIO[p.role], p.id).toBe(min);
        const r = ratio(p.fg, p.bg);
        expect(r, `${p.id} ${p.fg} on ${p.bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(min);
        expect(contrastRatio(p.fg, p.bg), p.id).toBeCloseTo(r, 9);
      }
    });
  }
});
