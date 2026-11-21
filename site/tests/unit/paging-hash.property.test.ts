// Feature: site-pages, Property Pg2: Hash and page agree (model part)
// **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PAGE_IDS, type PageId } from '../../src/data/pages';
import {
  formatHash,
  initialState,
  parseHash,
  transition,
  type PagingEffects,
  type PagingEvent,
  type PagingState,
} from '../../src/engine/paging';
import { fakeHistory, type FakeHistory } from '../lib/page-visibility';

const pageArb = fc.constantFrom<PageId>(...PAGE_IDS);

type Step =
  | { kind: 'request'; to: PageId; source: 'bar' | 'key' | 'swipe' | 'link'; reduced: boolean }
  | { kind: 'hash'; to: PageId; reduced: boolean }
  | { kind: 'effect-end' }
  | { kind: 'bad-hash'; junk: string };

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  fc.record({
    kind: fc.constant('request' as const),
    to: pageArb,
    source: fc.constantFrom('bar' as const, 'key' as const, 'swipe' as const, 'link' as const),
    reduced: fc.boolean(),
  }),
  fc.record({ kind: fc.constant('hash' as const), to: pageArb, reduced: fc.boolean() }),
  fc.constant({ kind: 'effect-end' as const }),
  fc.record({ kind: fc.constant('bad-hash' as const), junk: fc.string() }),
);

// Any initial hash: valid, empty, or arbitrary text.
const startHashArb = fc.oneof(pageArb.map(formatHash), fc.constant(''), fc.string());

function applyEffects(history: FakeHistory, state: PagingState, effects: PagingEffects): void {
  if (effects.hash === 'push') history.pushState(null, '', formatHash(state.current));
  else if (effects.hash === 'replace') history.replaceState(null, '', formatHash(state.current));
}

describe('Pg2: hash and page agree (model part)', () => {
  it('after the last effect-end the hash equals formatHash(current)', () => {
    fc.assert(
      fc.property(startHashArb, fc.array(stepArb, { maxLength: 40 }), (start, steps) => {
        const history = fakeHistory(start);
        const init = initialState(start);
        let state = init.state;
        if (init.repairHash) history.replaceState(null, '', formatHash(state.current));
        for (const step of steps) {
          let event: PagingEvent;
          if (step.kind === 'request') {
            event = { type: 'request', to: step.to, source: step.source, reduced: step.reduced };
          } else if (step.kind === 'hash') {
            // The visitor changed the hash; the browser already shows it.
            history.replaceState(null, '', formatHash(step.to));
            event = { type: 'request', to: step.to, source: 'hash', reduced: step.reduced };
          } else if (step.kind === 'bad-hash') {
            history.replaceState(null, '', step.junk);
            event = { type: 'bad-hash' };
          } else {
            event = { type: 'effect-end' };
          }
          const out = transition(state, event);
          applyEffects(history, out.state, out.effects);
          state = out.state;
        }
        // Finish the open effects: a held request may start another one.
        for (let guard = 0; state.leaving !== null && guard < 5; guard++) {
          const out = transition(state, { type: 'effect-end' });
          applyEffects(history, out.state, out.effects);
          state = out.state;
        }
        expect(state.leaving).toBeNull();
        expect(history.hash()).toBe(formatHash(state.current));
      }),
      { numRuns: 200 },
    );
  });

  it("a visitor's accepted Turn writes exactly one push; a hash-source Turn writes none", () => {
    fc.assert(
      fc.property(
        pageArb,
        pageArb,
        fc.constantFrom('bar' as const, 'key' as const, 'swipe' as const, 'link' as const),
        fc.boolean(),
        (from, to, source, reduced) => {
          fc.pre(from !== to);
          const s = initialState(formatHash(from)).state;
          const out = transition(s, { type: 'request', to, source, reduced });
          expect(out.effects.hash).toBe('push');
          const viaHash = transition(s, { type: 'request', to, source: 'hash', reduced });
          expect(viaHash.effects.hash).toBeNull();
        },
      ),
    );
  });

  it('the two repairs write replace', () => {
    fc.assert(
      fc.property(fc.string(), pageArb, (junk, id) => {
        fc.pre(parseHash(junk) === null);
        expect(initialState(junk).repairHash).toBe(true);
        const bad = transition(initialState(formatHash(id)).state, { type: 'bad-hash' });
        expect(bad.effects.hash).toBe('replace');
      }),
    );
  });

  it('parseHash round-trips and rejects everything else', () => {
    for (const id of PAGE_IDS) expect(parseHash(formatHash(id))).toBe(id); // finite space, enumerated
    fc.assert(
      fc.property(fc.string(), (s) => {
        const valid = PAGE_IDS.some((id) => s === `#${id}`);
        expect(parseHash(s) === null).toBe(!valid);
      }),
    );
  });
});
