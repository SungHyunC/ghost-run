// Feature: site-pages, Property Pg9: Key and swipe rules (input-rules)
// **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 7.5**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PAGE_IDS, type PageId } from '../../src/data/pages';
import {
  ignoreKey,
  ignoreSwipeStart,
  keyToStep,
  swipeStep,
  type KeyLike,
} from '../../src/engine/paging-input';
import { initialState, transition } from '../../src/engine/paging';

const RUNS = { numRuns: 200 };

const keyArb = fc.oneof(
  fc.constantFrom(
    'ArrowRight',
    'ArrowLeft',
    'PageDown',
    'PageUp',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
    ' ',
    'Enter',
    'Tab',
    'a',
  ),
  fc.string({ maxLength: 8 }),
);
const tagArb = fc.constantFrom('INPUT', 'input', 'TEXTAREA', 'SELECT', 'DIV', 'BODY', 'BUTTON', 'A', 'MAIN');
const roleArb = fc.constantFrom<string | null>(
  null,
  'tab',
  'slider',
  'switch',
  'textbox',
  'button',
  'link',
  'tablist',
  'region',
);
const targetArb = fc.record({
  tagName: tagArb,
  isContentEditable: fc.boolean(),
  role: roleArb,
});
const keyEventArb: fc.Arbitrary<KeyLike> = fc.record({
  key: keyArb,
  defaultPrevented: fc.boolean(),
  repeat: fc.boolean(),
  altKey: fc.boolean(),
  ctrlKey: fc.boolean(),
  metaKey: fc.boolean(),
  shiftKey: fc.boolean(),
  target: targetArb,
});

describe('Pg9 key rules', () => {
  it('keyToStep maps exactly the four paging keys', () => {
    fc.assert(
      fc.property(keyArb, (k) => {
        const want = k === 'ArrowRight' || k === 'PageDown' ? 1 : k === 'ArrowLeft' || k === 'PageUp' ? -1 : 0;
        expect(keyToStep(k)).toBe(want);
      }),
      RUNS,
    );
  });

  it('ignoreKey is true exactly for the listed targets and flags', () => {
    fc.assert(
      fc.property(keyEventArb, (e) => {
        const t = e.target;
        if (t === null) throw new Error('unreachable');
        const tag = t.tagName.toLowerCase();
        const want =
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          t.isContentEditable ||
          (t.role !== null && ['tab', 'slider', 'switch', 'textbox'].includes(t.role)) ||
          e.defaultPrevented ||
          e.repeat ||
          e.altKey ||
          e.ctrlKey ||
          e.metaKey ||
          e.shiftKey;
        expect(ignoreKey(e)).toBe(want);
      }),
      RUNS,
    );
  });
});

describe('Pg9 swipe rules', () => {
  const coord = fc.integer({ min: -400, max: 400 });
  const point = fc.record({ x: coord, y: coord });

  it('swipeStep follows the dx and |dx| > |dy| rule', () => {
    fc.assert(
      fc.property(point, point, (a, b) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const horizontal = Math.abs(dx) > Math.abs(dy);
        const want = dx < -60 && horizontal ? 1 : dx > 60 && horizontal ? -1 : 0;
        expect(swipeStep(a, b)).toBe(want);
      }),
      RUNS,
    );
  });

  it('ignoreSwipeStart is true exactly for form fields and sliders', () => {
    fc.assert(
      fc.property(tagArb, roleArb, fc.boolean(), (tagName, role, insideSlider) => {
        const tag = tagName.toLowerCase();
        const want =
          tag === 'input' || tag === 'textarea' || tag === 'select' || role === 'slider' || insideSlider;
        expect(ignoreSwipeStart({ tagName, role, insideSlider })).toBe(want);
      }),
      RUNS,
    );
  });
});

describe('Pg9 model check at the ends', () => {
  it('a step in the blocked direction leaves the transition state unchanged', () => {
    fc.assert(
      fc.property(fc.constantFrom<-1 | 1>(-1, 1), fc.boolean(), (step, reduced) => {
        const edge: PageId = step === -1 ? PAGE_IDS[0]! : PAGE_IDS[PAGE_IDS.length - 1]!;
        const { state } = initialState(`#${edge}`);
        // The step clamps to the page range, so a blocked step requests the current page.
        const index = Math.min(PAGE_IDS.length - 1, Math.max(0, PAGE_IDS.indexOf(edge) + step));
        const to = PAGE_IDS[index]!;
        const out = transition(state, { type: 'request', to, source: 'key', reduced });
        expect(out.state).toBe(state);
        expect(out.effects.startTimer).toBe(false);
        expect(out.effects.announce).toBeNull();
      }),
      RUNS,
    );
  });
});
