// Feature: ui-kit, Property 6: Contrast
// **Validates: Requirements 11.6, 12.8, 12.9, 12.10**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { CONTRAST_PAIRS, THEMES, type Theme } from '../../src/theme/tokens';
import {
  composite,
  compositeChain,
  contrast,
  luminance,
  parseColor,
  type Rgba,
} from '../support/contrast';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { createCounter } from '../support/pbt-stats';

const THRESHOLD = { text: 4.5, 'large-text': 3, graphic: 3 } as const;
const themes: readonly Theme[] = ['dark', 'light'];

const rgb = fc.record({
  r: fc.integer({ min: 0, max: 255 }),
  g: fc.integer({ min: 0, max: 255 }),
  b: fc.integer({ min: 0, max: 255 }),
  a: fc.constant(1),
});
const alpha = fc.double({ min: 0, max: 1, noNaN: true });

function same(x: Rgba, y: Rgba): boolean {
  return (
    Math.abs(x.r - y.r) < 1e-9 && Math.abs(x.g - y.g) < 1e-9 && Math.abs(x.b - y.b) < 1e-9
  );
}

describe('UI-P6 contrast pairs', () => {
  it('UI-P6: every declared pair meets its threshold in both themes (exhaustive)', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    let examples = 0;
    for (const theme of themes) {
      const tokens = THEMES[theme];
      let tight: { id: string; ratio: number; threshold: number } | undefined;
      expect(CONTRAST_PAIRS[theme].length).toBe(25);
      for (const pair of CONTRAST_PAIRS[theme]) {
        const layers = pair.backdrop.map((n) => parseColor(tokens[n] as string));
        const back = compositeChain(layers);
        const fg = composite(parseColor(tokens[pair.fg] as string), back);
        const ratio = contrast(fg, back);
        const threshold = THRESHOLD[pair.role];
        examples++;
        console.log(`UI-P6 ${theme} ${pair.id} ${pair.role} ratio=${ratio.toFixed(3)} min=${threshold}`);
        expect(ratio, `${theme} ${pair.id}`).toBeGreaterThanOrEqual(threshold);
        if (tight === undefined || ratio < tight.ratio) tight = { id: pair.id, ratio, threshold };
      }
      console.log(
        `UI-P6 tightest ${theme}: ${tight?.id} ratio=${tight?.ratio.toFixed(3)} threshold=${tight?.threshold}`,
      );
    }
    console.log(`UI-P6 pairs examples run: ${examples}`);
    expect(examples).toBe(50);
  });
});

describe('UI-P6 contrast function', () => {
  const run = (name: string, prop: fc.IPropertyWithHooks<unknown[]> | fc.IPropertyWithHooks<any>, counter: ReturnType<typeof createCounter>) => {
    it(
      name,
      () => {
        fc.assert(prop as fc.IPropertyWithHooks<any>, params('full'));
        counter.print();
        expect(counter.counts['examples']).toBeGreaterThan(0);
      },
      PBT_TIMEOUT,
    );
  };

  const c1 = createCounter('UI-P6 identity');
  run(
    'UI-P6: contrast(a, a) is 1',
    fc.property(rgb, (a) => {
      c1.add('examples');
      return Math.abs(contrast(a, a) - 1) < 1e-12;
    }),
    c1,
  );

  const c2 = createCounter('UI-P6 symmetry and lower bound');
  run(
    'UI-P6: contrast is symmetric and at least 1',
    fc.property(rgb, rgb, (a, b) => {
      c2.add('examples');
      const r = contrast(a, b);
      return r === contrast(b, a) && r >= 1;
    }),
    c2,
  );

  const c3 = createCounter('UI-P6 black on white');
  it('UI-P6: black on white is 21', () => {
    const black: Rgba = { r: 0, g: 0, b: 0, a: 1 };
    const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
    c3.add('examples');
    expect(contrast(black, white)).toBeCloseTo(21, 10);
    expect(luminance(white)).toBeCloseTo(1, 12);
    c3.print();
  });

  const c4 = createCounter('UI-P6 self-composite');
  run(
    'UI-P6: compositing a color over itself with any alpha returns the same color',
    fc.property(rgb, alpha, (c, a) => {
      c4.add('examples');
      return same(composite({ ...c, a }, c), c);
    }),
    c4,
  );
});
