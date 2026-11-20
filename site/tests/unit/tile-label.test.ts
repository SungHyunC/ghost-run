import { describe, expect, it } from 'vitest';
import { tileLabel, type TileLabelParams } from '../../scripts/lib/tile-label';
// @ts-expect-error plain .mjs module without declarations
import { printJson } from '../../scripts/lib/print-json.mjs';

// Parameter rows of the design table for seed 42: [friction ratio, mass ratio, handle mm, delay].
const ROWS: Array<[number, number, number, number, string]> = [
  [0.41, 1.98, 4.4, 2, 'friction \u00D70.41'],
  [0.93, 1.01, 5.5, 3, 'handle 5.5 mm'],
  [0.46, 1.79, 5.1, 5, 'delay 5 steps'],
  [1.68, 1.0, 4.0, 2, 'friction \u00D71.68'],
  [1.63, 1.76, 2.6, 3, 'mass \u00D71.76'],
  [0.95, 1.44, 3.4, 3, 'delay 3 steps'],
  [0.3, 0.86, 1.5, 4, 'friction \u00D70.30'],
  [0.97, 0.66, 2.4, 0, 'mass \u00D70.66'],
];

function params(fr: number, mr: number, mm: number, delay: number): TileLabelParams {
  return { drawerFrictionN: fr * 2, drawerMassKg: mr * 0.6, handleOffsetM: [mm / 1000, 0, 0], commandDelaySteps: delay };
}

describe('tileLabel', () => {
  it.each(ROWS)('row %s/%s/%s/%s gives the table label', (fr, mr, mm, delay, label) => {
    expect(tileLabel(params(fr, mr, mm, delay))).toBe(label);
  });

  it('gives a tie to the earlier candidate', () => {
    // Mass and friction both score 0 and the handle and delay score 0; friction comes first.
    expect(tileLabel(params(1, 1, 0, 0))).toBe('friction \u00D71.00');
    // Handle 5 mm scores 0.5, delay 3 steps scores 0.5: handle comes first.
    expect(tileLabel(params(1, 1, 5, 3))).toBe('handle 5.0 mm');
  });
});

describe('printJson', () => {
  it('sorts keys at every level, keeps array order, ends with one newline', () => {
    expect(printJson({ b: [{ z: 1, a: 2 }, 3], a: null })).toBe(
      '{\n  "a": null,\n  "b": [\n    {\n      "a": 2,\n      "z": 1\n    },\n    3\n  ]\n}\n',
    );
  });
});
