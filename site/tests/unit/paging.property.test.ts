// Feature: site-pages, Property Pg1 (exactly one page is active and reachable; model part)
// Validates: Requirements 3.1, 3.4, 5.6, 5.7, 7.1, 7.3, 7.4, 8.2
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PAGE_IDS, type PageId } from '../../src/data/pages';
import {
  initialState,
  transition,
  formatHash,
  type PagingEvent,
  type PagingState,
  type Source,
} from '../../src/engine/paging';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const pageArb: fc.Arbitrary<PageId> = fc.constantFrom(...PAGE_IDS);
const sourceArb: fc.Arbitrary<Source> = fc.constantFrom('bar', 'key', 'swipe', 'link', 'hash', 'held');

const requestArb = fc.record({
  type: fc.constant('request' as const),
  to: pageArb,
  source: sourceArb,
  reduced: fc.boolean(),
});
const endArb = fc.record({ type: fc.constant('effect-end' as const), reduced: fc.boolean() });
const eventArb: fc.Arbitrary<Extract<PagingEvent, { type: 'request' | 'effect-end' }>> = fc.oneof(
  requestArb,
  endArb,
);

function checkInvariants(s: PagingState): void {
  expect(PAGE_IDS).toContain(s.current);
  expect(s.leaving === null || s.leaving !== s.current).toBe(true);
  expect(s.opened[s.current]).toBe(true);
}

describe('Pg1: paging model', () => {
  it(
    'keeps one current page, clears leaving as required, and settles on the last request',
    () => {
      fc.assert(
        fc.property(pageArb, fc.array(eventArb, { maxLength: 40 }), (start, events) => {
          let { state } = initialState(formatHash(start));
          let lastRequest: PageId | null = null;
          for (const e of events) {
            const before = state;
            const out = transition(state, e);
            state = out.state;
            checkInvariants(state);
            if (e.type === 'request') {
              lastRequest = e.to;
              // A request that arrives during an effect is held, so leaving stays.
              if (e.reduced && before.leaving === null) expect(state.leaving).toBeNull();
            } else if (e.reduced || out.effects.announce === null) {
              // A held request that starts a new animated Turn keeps leaving set.
              expect(state.leaving).toBeNull();
            }
            if (out.effects.announce !== null) {
              const reduced = e.reduced ?? false;
              expect(out.effects.announce).toBe(state.current);
              expect(out.effects.startTimer).toBe(!reduced);
            } else {
              expect(out.effects.startTimer).toBe(false);
            }
          }
          const end = transition(state, { type: 'effect-end', reduced: true });
          checkInvariants(end.state);
          expect(end.state.leaving).toBeNull();
          if (lastRequest !== null) expect(end.state.current).toBe(lastRequest);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('reaches the target from every ordered page pair (finite space, enumerated)', () => {
    let pairs = 0;
    for (const from of PAGE_IDS) {
      for (const to of PAGE_IDS) {
        pairs += 1;
        const { state } = initialState(formatHash(from));
        const out = transition(state, { type: 'request', to, source: 'bar', reduced: false });
        expect(out.state.current).toBe(to);
        expect(out.state.opened[to]).toBe(true);
        const done = transition(out.state, { type: 'effect-end' });
        expect(done.state.current).toBe(to);
        expect(done.state.leaving).toBeNull();
      }
    }
    expect(pairs).toBe(25);
  });
});
