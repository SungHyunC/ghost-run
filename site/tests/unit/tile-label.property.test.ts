import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tileLabel, type TileLabelParams } from '../../scripts/lib/tile-label';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

interface Range {
  readonly min: number;
  readonly max: number;
}
interface VariantConfigJson {
  readonly ranges: {
    readonly drawerFrictionN: Range;
    readonly drawerMassKg: Range;
    readonly handleOffsetM: { readonly x: Range; readonly y: Range; readonly z: Range };
    readonly commandDelaySteps: Range;
  };
}

const config = JSON.parse(
  readFileSync(new URL('../../../worlds/drawer-arm/variant-config.json', import.meta.url), 'utf8'),
) as VariantConfigJson;
const R = config.ranges;

// Base parameters of the drawer-arm world (friction 2 N, mass 0.6 kg) and the fixed scoring constants.
const BASE_FRICTION_N = 2;
const BASE_MASS_KG = 0.6;
const HANDLE_SCALE_MM = 10;
const DELAY_SCALE_STEPS = 6;
const TIMES = '\u00D7';

const real = (r: Range): fc.Arbitrary<number> => fc.double({ min: r.min, max: r.max, noNaN: true, noDefaultInfinity: true });

const paramsArb: fc.Arbitrary<TileLabelParams> = fc.record({
  drawerFrictionN: real(R.drawerFrictionN),
  drawerMassKg: real(R.drawerMassKg),
  handleOffsetM: fc.tuple(real(R.handleOffsetM.x), real(R.handleOffsetM.y), real(R.handleOffsetM.z)),
  commandDelaySteps: fc.integer({ min: R.commandDelaySteps.min, max: R.commandDelaySteps.max }),
});

/** Independent oracle: candidates in table order with their scores and label texts. */
function expected(p: TileLabelParams): Array<{ score: number; text: string }> {
  const fr = p.drawerFrictionN / BASE_FRICTION_N;
  const mr = p.drawerMassKg / BASE_MASS_KG;
  const mm = Math.sqrt(p.handleOffsetM.reduce((a, c) => a + (c * 1000) ** 2, 0));
  return [
    { score: Math.abs(Math.log(fr)), text: `friction ${TIMES}${fr.toFixed(2)}` },
    { score: Math.abs(Math.log(mr)), text: `mass ${TIMES}${mr.toFixed(2)}` },
    { score: mm / HANDLE_SCALE_MM, text: `handle ${mm.toFixed(1)} mm` },
    { score: p.commandDelaySteps / DELAY_SCALE_STEPS, text: `delay ${p.commandDelaySteps} steps` },
  ];
}

function winner(p: TileLabelParams): string {
  const c = expected(p);
  let best = c[0];
  for (const x of c) if (best !== undefined && x.score > best.score) best = x;
  return best?.text ?? '';
}

describe('tile label rule (property)', () => {
  // Feature: site, Property 10: Tile label rule
  // **Validates: Requirements 10.4**
  it(
    'names the highest-scoring candidate in the format of that candidate',
    () => {
      fc.assert(
        fc.property(paramsArb, (p) => {
          const label = tileLabel(p);
          if (label !== winner(p)) return false;
          return (
            /^friction \u00D7\d+\.\d{2}$/.test(label) ||
            /^mass \u00D7\d+\.\d{2}$/.test(label) ||
            /^handle \d+\.\d mm$/.test(label) ||
            /^delay \d+ steps$/.test(label)
          );
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'gives a tie to the earlier candidate',
    () => {
      // Handle norm of 10 * s mm along z scores s; delay d scores d / 6. Equal scores: handle comes first.
      fc.assert(
        fc.property(fc.integer({ min: 1, max: R.commandDelaySteps.max }), (d) => {
          const mm = (d / DELAY_SCALE_STEPS) * HANDLE_SCALE_MM;
          const p: TileLabelParams = {
            drawerFrictionN: BASE_FRICTION_N,
            drawerMassKg: BASE_MASS_KG,
            handleOffsetM: [0, 0, mm / 1000],
            commandDelaySteps: d,
          };
          const scores = expected(p).map((c) => c.score);
          // Skip draws where floating point breaks the exact tie.
          if (scores[2] !== scores[3]) return true;
          return tileLabel(p).startsWith('handle ');
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
      expect(tileLabel({ drawerFrictionN: 2, drawerMassKg: 0.6, handleOffsetM: [0, 0, 0], commandDelaySteps: 0 })).toBe(
        `friction ${TIMES}1.00`,
      );
    },
    PBT_TIMEOUT,
  );
});
