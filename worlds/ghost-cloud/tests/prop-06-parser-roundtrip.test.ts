// Feature: ghost-cloud, Property 6: Parser round trip
// **Validates: Requirements 1.2**
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseLine } from '../src/parse.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { actionArb } from './support/arbitraries.js';
import { formatAction } from './support/format-action.js';

describe('Property 6: parser round trip', () => {
  it('parseLine(formatAction(a)) equals a', () => {
    fc.assert(
      fc.property(actionArb, (a) => {
        expect(parseLine(formatAction(a))).toStrictEqual(a);
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('re-formatting a supported parse result is stable', () => {
    const lines = fc.oneof(
      actionArb.map(formatAction),
      fc.string({ unit: 'binary', maxLength: 60 }),
      actionArb.map((a) => `${formatAction(a)} ${formatAction(a)}`),
    );
    fc.assert(
      fc.property(lines, (x) => {
        const first = parseLine(x);
        if (first.kind === 'unsupported') return true;
        expect(parseLine(formatAction(first))).toStrictEqual(first);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);
});
