import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import { CopyPane } from '../../src/components/walk/CopyPane';
import { RealityPane } from '../../src/components/walk/RealityPane';
import runsJson from '../../src/data/runs.json';
import { toWalkRuns } from '../../src/data/walk-records';
import { drain, failingLoaders } from '../lib/live-fakes';
import { visibility } from '../lib/page-visibility';
import type { PageId } from '../../src/data/pages';
import type { RunsFile } from '../../src/data/types';

const runsFile = runsJson as unknown as RunsFile;
const runs = toWalkRuns(runsFile);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Page({ current = 'cover' }: { current?: PageId }) {
  return (
    <>
      <Sprite />
      <Walkthrough
        runs={runsFile}
        visibility={visibility(current)}
        loaders={failingLoaders}
        renderReality={(record) => <RealityPane scene={record.reality} />}
        renderCopy={(record, view) => <CopyPane record={record} copy={view.copy} fixed={view.plan.rev} />}
      />
    </>
  );
}

const chip = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });
const rail = () => screen.getAllByRole('listitem').map((li) => li.querySelector('button') as HTMLButtonElement);
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const q = (c: Element, sel: string) => c.querySelector(sel)?.textContent;
/** The plan text in the plan box (Shell and Cloud). */
const boxText = (c: Element) => (c.querySelector('#cmd') as HTMLInputElement).value;
const isFixed = (c: Element) => c.querySelector('.ctl')?.classList.contains('rev') === true;

describe('Walkthrough end to end', () => {
  it('starts autoplay only after the Run page is opened', async () => {
    const { container, rerender } = render(<Page current="cover" />);
    advance(60000);
    expect(q(container, '#stamp')).toBe('');
    expect(q(container, '#sayt')).toBe('');
    rerender(<Page current="run" />);
    await drain();
    advance(60000);
    expect(q(container, '#stamp')).toBe('PASS');
  });

  it.each([
    ['Ghost Shell', 'shell'],
    ['Ghost Hand', 'hand'],
    ['Ghost Cloud', 'cloud'],
  ] as const)('%s plays all five steps and reaches PASS', async (name, id) => {
    const { container } = render(<Page />);
    fireEvent.click(chip(name));
    await drain();
    const stamps = new Set<string>();
    for (let t = 0; t < 60000; t += 100) {
      advance(100);
      stamps.add(q(container, '#stamp') ?? '');
    }
    expect(stamps.has('BLOCKED')).toBe(runs.worlds[id].plan.verdict === 'block');
    expect(q(container, '#stamp')).toBe('PASS');
    expect(rail().map((b) => b.getAttribute('aria-current'))).toEqual([null, null, null, null, 'step']);
    expect(isFixed(container)).toBe(true);
    if (id !== 'hand') expect(boxText(container)).toBe(runs.worlds[id].fixed.display);
  });

  it('Hand shows the joint-limit label on a recorded variant', async () => {
    const { container } = render(<Page />);
    fireEvent.click(chip('Ghost Hand'));
    await drain();
    advance(10000);
    const after = runs.worlds.hand.plan.copyAfter;
    const limited = after.kind === 'hand' ? after.tiles.filter((t) => t.jointLimit) : [];
    expect(limited.length).toBeGreaterThan(0);
    expect(container.querySelector('#copyb')?.textContent).toContain('joint limit');
  });

  it('shows the recorded plan first and the fixed plan after step 5', async () => {
    const { container } = render(<Page />);
    fireEvent.click(chip('Ghost Shell'));
    await drain();
    expect(boxText(container)).toBe(runs.worlds.shell.plan.display);
    expect(isFixed(container)).toBe(false);
    advance(1000);
    expect(q(container, '#sayt')).not.toBe('');
    advance(60000);
    expect(boxText(container)).toBe(runs.worlds.shell.fixed.display);
    expect(boxText(container)).not.toBe(runs.worlds.shell.plan.display);
  });

  it('a step jump enters that step; replay restarts the world', async () => {
    const { container } = render(<Page />);
    fireEvent.click(chip('Ghost Shell'));
    await drain();
    advance(60000);
    fireEvent.click(rail()[2] as HTMLButtonElement);
    advance(0);
    expect(rail().map((b) => b.getAttribute('aria-current'))).toEqual([null, null, 'step', null, null]);
    expect(rail().map((b) => b.classList.contains('done'))).toEqual([true, true, false, false, false]);
    fireEvent.click(screen.getByRole('button', { name: '↻ Replay' }));
    expect(q(container, '#stamp')).toBe('');
    expect(boxText(container)).toBe(runs.worlds.shell.plan.display);
    expect(chip('Ghost Shell').getAttribute('aria-selected')).toBe('true');
    advance(60000);
    expect(q(container, '#stamp')).toBe('PASS');
  });

  it('names the ward card after the violated wards of the fixed plan (the headline ward when none); no kind line', async () => {
    const { container } = render(<Page />);
    fireEvent.click(chip('Ghost Shell'));
    await drain();
    expect(container.querySelector('.wkind')).toBeNull();
    advance(60000);
    expect(q(container, '#wname')).toBe(runs.worlds.shell.ward.id);
  });
});
