/** @vitest-environment jsdom */
// DOM tests of the hero diagram: text equivalent, no inline style, the step caption, and reduced motion.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GhostFlow } from '../../src/flow/GhostFlow';
import { CAPTIONS, DWELL_MS, introTour, runTour } from '../../src/flow/tour';
import { FLOW_HEADING, FLOW_SUMMARY_TEXT } from '../../src/page-texts';

const blocked = { verdict: 'block' as const, command: 'sqlite3 app.db "DROP TABLE users;"', reason: 'no-data-loss: would delete 1,206 rows from users', stepCount: 1 };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function caption(container: HTMLElement): string {
  return container.querySelector('.gf-caption-text')?.textContent ?? '';
}

describe('GhostFlow', () => {
  it('names the figure, gives a text summary, hides the drawing, and uses no inline style', () => {
    const { container } = render(<GhostFlow />);
    expect(screen.getByRole('figure', { name: FLOW_HEADING })).toBeTruthy();
    expect(screen.getByText(FLOW_SUMMARY_TEXT)).toBeTruthy();
    expect(container.querySelector('svg.gf-svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[style]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Replay' }).className).toContain('gk-button');
    expect(caption(container)).toBe(introTour()[0]?.caption);
  });

  it('walks a blocked run step by step and ends on the fix-the-plan caption', () => {
    vi.useFakeTimers();
    const { container } = render(<GhostFlow run={blocked} />);
    const tour = runTour(blocked);
    expect(caption(container)).toBe(tour[0]?.caption);
    const seen = new Set<string>([caption(container)]);
    for (let i = 0; i < tour.length + 2; i++) {
      act(() => {
        vi.advanceTimersByTime(2000 + DWELL_MS);
      });
      seen.add(caption(container));
    }
    expect([...seen].some((c) => c.includes('no-data-loss: would delete 1,206 rows from users'))).toBe(true);
    expect(caption(container)).toBe(CAPTIONS.loopRun);
    expect(container.querySelector('.gf-node[data-node="out"]')?.getAttribute('data-on')).toBe('true');
    expect(container.querySelector('.gf-svg')?.getAttribute('data-candle')).toBe('out');
  });

  it('shows the last step at once and starts no timer under reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.useFakeTimers();
    const { container } = render(<GhostFlow run={blocked} />);
    expect(caption(container)).toBe(CAPTIONS.loopRun);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Replay starts the tour again from the plan', () => {
    vi.useFakeTimers();
    const { container } = render(<GhostFlow run={blocked} />);
    for (let i = 0; i < 12; i++) {
      act(() => {
        vi.advanceTimersByTime(2000 + DWELL_MS);
      });
    }
    expect(caption(container)).toBe(CAPTIONS.loopRun);
    act(() => {
      screen.getByRole('button', { name: 'Replay' }).click();
    });
    expect(caption(container)).toBe(runTour(blocked)[0]?.caption);
  });
});
