import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Walkthrough } from '../../src/components/Walkthrough';
import runsJson from '../../src/data/runs.json';
import { toWalkRuns } from '../../src/data/walk-records';
import { drain, failingLoaders } from '../lib/live-fakes';
import type { RunsFile } from '../../src/data/types';

const runsFile = runsJson as unknown as RunsFile;
const runs = toWalkRuns(runsFile);

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

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });
const railButtons = () => screen.getAllByRole('listitem').map((li) => li.querySelector('button') as HTMLButtonElement);

describe('Walkthrough frame', () => {
  it('has section #run with the sub-heading, three tabs, Replay, and an ordered stepper of five', () => {
    const { container } = render(<Walkthrough runs={runsFile} loaders={failingLoaders} />);
    expect(container.querySelector('section#run')).not.toBeNull();
    expect(container.querySelector('.sec-sub')?.textContent).toBe(
      "Give the ghost a plan. It tries it on a copy first, and only a lit candle lets reality change.",
    );
    expect(container.querySelectorAll('.tab')).toHaveLength(3);
    expect(screen.getByRole('button', { name: '↻ Replay' })).toBeTruthy();
    const stepper = container.querySelector('ol.stepper');
    expect(stepper?.querySelectorAll('button')).toHaveLength(5);
    expect(railButtons().map((b) => b.querySelector('span')?.textContent)).toEqual([
      'Copy',
      'Run',
      'Judge',
      'Verdict',
      'Fix & go',
    ]);
  });

  it('has an empty polite live region before step 1 and an aria-hidden actor', () => {
    const { container } = render(<Walkthrough runs={runsFile} loaders={failingLoaders} />);
    const say = container.querySelector('p#sayt');
    expect(say?.getAttribute('aria-live')).toBe('polite');
    expect(say?.textContent).toBe('');
    expect(container.querySelector('#actor')?.getAttribute('aria-hidden')).toBe('true');
    expect(railButtons().some((b) => b.className.includes('now'))).toBe(false);
  });

  it('tabs set aria-selected on the chosen tab only and reset the theater', async () => {
    const { container } = render(<Walkthrough runs={runsFile} loaders={failingLoaders} />);
    expect(tab('Ghost Shell').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(tab('Ghost Hand'));
    await drain();
    const selected = [...container.querySelectorAll('.tab')].filter((b) => b.getAttribute('aria-selected') === 'true');
    expect(selected.map((b) => b.textContent)).toEqual(['Ghost Hand']);
    expect(container.querySelector('#stamp')?.textContent).toBe('');
    expect(container.querySelector('#vnote')).toBeNull();
    expect(container.querySelector('#sayt')?.textContent).toBe('');
  });

  it('shows the Presets of the chosen world with the first one on', async () => {
    const { container } = render(<Walkthrough runs={runsFile} loaders={failingLoaders} />);
    await drain();
    expect([...container.querySelectorAll('#presets button')].map((b) => b.textContent)).toEqual([
      'DROP TABLE users',
      'rm -rf ./data ./build',
      'npm test',
    ]);
    fireEvent.click(tab('Ghost Cloud'));
    await drain();
    const on = [...container.querySelectorAll('#presets button.on')].map((b) => b.textContent);
    expect(on).toEqual(['delete prod-assets']);
  });

  it('replay restarts the current world', async () => {
    const { container } = render(<Walkthrough runs={runsFile} loaders={failingLoaders} />);
    fireEvent.click(tab('Ghost Cloud'));
    await drain();
    act(() => {
      vi.advanceTimersByTime(40000);
    });
    expect(container.querySelector('#stamp')?.textContent).toBe('PASS');
    fireEvent.click(screen.getByRole('button', { name: '↻ Replay' }));
    expect(tab('Ghost Cloud').getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('#stamp')?.textContent).toBe('');
  });

  it('a step button marks that step now and earlier steps done, with aria-current following', async () => {
    render(<Walkthrough runs={runsFile} loaders={failingLoaders} />);
    fireEvent.click(tab('Ghost Shell'));
    await drain();
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

  it('shows ward rows with check marks as text, then BLOCKED, then PASS with the fixed plan tag', async () => {
    const { container } = render(<Walkthrough runs={runsFile} loaders={failingLoaders} />);
    fireEvent.click(tab('Ghost Shell'));
    await drain();
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
    expect(container.querySelector('.ctl')?.classList.contains('rev')).toBe(true);
    expect(container.querySelector('.ctl .rev-tag')?.textContent).toBe('fixed by the agent');
  });
});
