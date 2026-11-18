// Feature: possession, Property 4: A ZWJ is allowed exactly between emoji
// **Validates: Requirements 2.2, 4.1, 4.2, 4.3**
// Scope: P7, both directions at the ZWJ boundary. Claimed everywhere.
// Not claimed: that a permitted sequence is semantically a valid emoji.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/possession/index.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';
import { asciiReporter, refZwjPermitted, toCodePoints, zwjContext, ZWJ } from './arbitraries.js';

const counters = {
  total: 0,
  permitted: 0,
  flagged: 0,
  boundaryLeft: 0,
  boundaryRight: 0,
  modifierSkipped: 0,
  flagNeighbour: 0,
  hiddenNeighbour: 0,
};

const zwjString = String.fromCodePoint(ZWJ);

function covered(text: string, index: number): boolean {
  return scanText(text).findings.some(
    (f) => f.category === 'zero-width' && f.offset <= index && index < f.offset + f.length,
  );
}

describe('Property 4: a ZWJ is allowed exactly between emoji', () => {
  it(
    'a zero-width Finding covers the ZWJ if and only if the oracle says it is not permitted',
    () => {
      fc.assert(
        fc.property(zwjContext, (ctx) => {
          const cps = toCodePoints(ctx.text);
          expect(cps[ctx.zwjIndex]).toBe(ZWJ);
          const permitted = refZwjPermitted(cps, ctx.zwjIndex);

          counters.total++;
          if (permitted) counters.permitted++;
          else counters.flagged++;
          if (ctx.before.length === 0) counters.boundaryLeft++;
          if (ctx.after.length === 0) counters.boundaryRight++;
          if (ctx.before.at(-1) === 'modifier' || ctx.after[0] === 'modifier') counters.modifierSkipped++;
          if (ctx.before.at(-1) === 'flag' || ctx.after[0] === 'flag') counters.flagNeighbour++;
          if (ctx.before.at(-1) === 'hidden' || ctx.after[0] === 'hidden') counters.hiddenNeighbour++;

          expect(covered(ctx.text, ctx.zwjIndex)).toBe(!permitted);
        }),
        { numRuns: NUM_RUNS, reporter: asciiReporter },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed examples: family emoji is clean, bare and flag-adjacent ZWJ are flagged', () => {
    const man = String.fromCodePoint(0x1f468);
    const woman = String.fromCodePoint(0x1f469);
    const fe0f = String.fromCodePoint(0xfe0f);
    const tone = String.fromCodePoint(0x1f3fb);
    expect(scanText(man + zwjString + woman).findings).toHaveLength(0);
    expect(scanText(man + tone + zwjString + fe0f + woman).findings).toHaveLength(0);
    expect(scanText(zwjString).findings).toHaveLength(1);
    expect(scanText(man + zwjString).findings).toHaveLength(1);
    expect(scanText(zwjString + woman).findings).toHaveLength(1);
    expect(scanText('a' + zwjString + 'b').findings).toHaveLength(1);
  });

  it('non-vacuity: every input class was generated', () => {
    expect(counters.total).toBeGreaterThan(0);
    expect(counters.permitted).toBeGreaterThan(0);
    expect(counters.flagged).toBeGreaterThan(0);
    expect(counters.boundaryLeft).toBeGreaterThan(0);
    expect(counters.boundaryRight).toBeGreaterThan(0);
    expect(counters.modifierSkipped).toBeGreaterThan(0);
    expect(counters.flagNeighbour).toBeGreaterThan(0);
    expect(counters.hiddenNeighbour).toBeGreaterThan(0);
  });
});
