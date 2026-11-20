import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Walkthrough } from '../../src/components/Walkthrough';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';

const runs = runsJson as unknown as RunsFile;

/** An IntersectionObserver that never reports: the section is never "in view". */
class IdleObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', IdleObserver);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const chip = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
const railButtons = () => screen.getAllByRole('listitem').map((li) => li.querySelector('button') as HTMLButtonElement);

describe('Walkthrough frame', () => {
  it('has section #run with the sub-heading, three chips, Replay, and an ordered rail of five', () => {
    const { container } = render(<Walkthrough runs={runs} />);
    expect(container.querySelector('section#run')).not.toBeNull();
    expect(container.querySelector('.sec-sub')?.textContent).toBe(
      "Pick a world. The ghost copies it, runs the agent's plan on the copy, lets the wards judge, and only a lit candle lets reality change.",
    );
    expect(container.querySelectorAll('.wchip')).toHaveLength(3);
    expect(screen.getByRole('button', { name: '↻ Replay' })).toBeTruthy();
    const rail = container.querySelector('ol.rail');
    expect(rail?.querySelectorAll('button')).toHaveLength(5);
    expect(railButtons().map((b) => b.querySelector('b')?.textContent)).toEqual([
      'Copy',
      'Run on the copy',
      'Judge',
      'Verdict',
      'Fix and go',
    ]);
  });

  it('has an empty polite live region before step 1 and an aria-hidden actor', () => {
    const { container } = render(<Walkthrough runs={runs} />);
    const say = container.querySelector('p#sayt');
    expect(say?.getAttribute('aria-live')).toBe('polite');
    expect(say?.textContent).toBe('');
    expect(container.querySelector('#actor')?.getAttribute('aria-hidden')).toBe('true');
    expect(railButtons().some((b) => b.className.includes('now'))).toBe(false);
  });

  it('chips set aria-pressed on the chosen chip only and reset the theater', () => {
    const { container } = render(<Walkthrough runs={runs} />);
    expect(chip('Ghost Shell').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip('Ghost Hand'));
    const pressed = [...container.querySelectorAll('.wchip')].filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((b) => b.textContent)).toEqual(['Ghost Hand']);
    expect(container.querySelector('#plancode')?.textContent).toBe(runs.worlds.hand.plan.display);
    expect(container.querySelector('#stamp')?.textContent).toBe('');
    expect(container.querySelector('#vnote')?.textContent).toBe('The candle waits for the wards.');
    expect(container.querySelector('#sayt')?.textContent).toBe('');
  });

  it('replay restarts the current world', () => {
    const { container } = render(<Walkthrough runs={runs} />);
    fireEvent.click(chip('Ghost Cloud'));
    act(() => {
      vi.advanceTimersByTime(40000);
    });
    expect(container.querySelector('#stamp')?.textContent).toBe('PASS');
    fireEvent.click(screen.getByRole('button', { name: '↻ Replay' }));
    expect(chip('Ghost Cloud').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('#stamp')?.textContent).toBe('');
    expect(container.querySelector('#plancode')?.textContent).toBe(runs.worlds.cloud.plan.display);
  });

  it('a step button marks that step now and earlier steps done, with aria-current following', () => {
    render(<Walkthrough runs={runs} />);
    fireEvent.click(railButtons()[2] as HTMLButtonElement);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const b = railButtons();
    expect(b.map((x) => x.classList.contains('done'))).toEqual([true, true, false, false, false]);
    expect(b.map((x) => x.classList.contains('now'))).toEqual([false, false, true, false, false]);
    expect(b.map((x) => x.getAttribute('aria-current'))).toEqual([null, null, 'step', null, null]);
    fireEvent.click(b[4] as HTMLButtonElement);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(railButtons().map((x) => x.getAttribute('aria-current'))).toEqual([null, null, null, null, 'step']);
  });

  it('shows ward rows with check marks as text, then BLOCKED, then PASS with the fixed plan tag', () => {
    const { container } = render(<Walkthrough runs={runs} />);
    fireEvent.click(chip('Ghost Shell'));
    act(() => {
      vi.advanceTimersByTime(2700 + 3900 + 3300);
    });
    const rows = [...container.querySelectorAll('.chk')];
    expect(rows.length).toBe(runs.worlds.shell.plan.checks.length);
    expect(rows[0]?.textContent).toContain('✗');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector('#stamp')?.textContent).toBe('BLOCKED');
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(container.querySelector('#stamp')?.textContent).toBe('PASS');
    expect(container.querySelector('.chk')?.textContent).toContain('✓');
    expect(container.querySelector('#plan')?.classList.contains('rev')).toBe(true);
    expect(container.querySelector('.rev-tag')?.textContent).toBe('fixed by the agent');
  });
});
