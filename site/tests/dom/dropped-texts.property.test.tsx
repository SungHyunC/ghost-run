import { cleanup, fireEvent, render } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { PAGE_IDS, type PageId } from '../../src/data/pages';
import { LANDING_DROPPED, assertNoneRendered, collect, findRendered } from '../lib/dropped-texts';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

// Feature: site-pages, Property Pg4: Dropped texts stay dropped (landing part)
// **Validates: Requirements 12.1, 12.3, 12.5, 12.6**

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  // Reduced motion: a page turn takes effect at once, so no timer is needed.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  window.history.replaceState(null, '', window.location.pathname);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function goTo(container: HTMLElement, page: PageId): void {
  fireEvent.click(container.querySelectorAll('#pgDots .pg-dot')[PAGE_IDS.indexOf(page)] as Element);
}

describe('Pg4: dropped texts stay dropped (landing)', () => {
  it(
    'renders none of the dropped texts in any page state, X-ray on or off',
    () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({ page: fc.constantFrom(...PAGE_IDS), xray: fc.boolean() }), { minLength: 1, maxLength: 6 }),
          (steps) => {
            const { container, unmount } = render(<App />);
            try {
              for (const s of steps) {
                goTo(container, s.page);
                const xray = container.querySelector<HTMLInputElement>('#xray');
                if (xray !== null && xray.checked !== s.xray) fireEvent.click(xray);
                expect(findRendered(collect(container), LANDING_DROPPED)).toEqual([]);
              }
            } finally {
              unmount();
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('fails on the fixture: the folder line "core/ · ui/" added under a rendered part', () => {
    const { container } = render(<App />);
    expect(() => {
      assertNoneRendered(collect(container), LANDING_DROPPED);
    }).not.toThrow();
    const part = container.querySelector('#recipe .part') ?? container.querySelector('#recipe');
    const line = document.createElement('code');
    line.textContent = 'core/ · ui/';
    part?.appendChild(line);
    expect(part).not.toBeNull();
    expect(() => {
      assertNoneRendered(collect(container), LANDING_DROPPED);
    }).toThrow(/core\/ · ui\//);
  });

  it('also catches a single folder line, a title, and an aria-label', () => {
    const { container } = render(<App />);
    const el = document.createElement('span');
    el.setAttribute('title', 'Costume: Hacker hoodie');
    el.setAttribute('aria-label', 'worlds/drawer-arm');
    container.appendChild(el);
    expect(findRendered(collect(container), LANDING_DROPPED)).toEqual(['worlds/drawer-arm', 'Costume: ']);
  });
});
