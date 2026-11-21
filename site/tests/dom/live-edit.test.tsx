// The plan input after a run (fix B) and the copy at step 5 without a fix (fix D), through the whole Walkthrough.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cloudWardsText from '../../../worlds/ghost-cloud/wards.yaml?raw';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import { CopyPane } from '../../src/components/walk/CopyPane';
import { RealityPane } from '../../src/components/walk/RealityPane';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import { createCloudEngine } from '../../src/live/cloud';
import type { LiveLoaders } from '../../src/live/types';
import { drain, recordedLoaders, visibility } from '../lib/live-fakes';

/** Not opened: no engine loads and nothing autoplays; tests drive the box themselves. */
const idle = visibility('cover');
const runs = runsJson as unknown as RunsFile;

beforeEach(() => {
  // Only the page's timers are faked; the real Cloud world needs a few real turns of the event loop.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });
const input = (c: Element) => c.querySelector('#cmd') as HTMLInputElement;
const copy = (c: Element) => c.querySelector('#copyb') as HTMLElement;
/** What the copy pane shows: each bucket with its classes and text. */
const snapshot = (c: Element) => [...copy(c).querySelectorAll('.bucket')].map((b) => `${b.getAttribute('data-b') ?? ''}|${b.className}|${b.textContent ?? ''}`);

function page(loaders: LiveLoaders) {
  return render(
    <>
      <Sprite />
      <Walkthrough
        visibility={idle}
        runs={runs}
        loaders={loaders}
        renderReality={(record) => <RealityPane scene={record.reality} />}
        renderCopy={(record, view) => <CopyPane record={record} copy={view.copy} fixed={view.plan.rev} />}
      />
    </>,
  );
}

/** Lets a real engine answer: turns of the event loop until the loading note is gone. */
async function answered(container: Element): Promise<void> {
  for (let i = 0; i < 200 && container.querySelector('#livenote') !== null; i++) {
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  }
}

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe('the plan input after a run', () => {
  it('is editable after "Fix and go", and editing drops the "fixed by the agent" tag and the fixed text', async () => {
    const { container } = page(recordedLoaders(runs).loaders);
    fireEvent.click(tab('Ghost Shell'));
    await drain();
    advance(40_000);
    expect(container.querySelector('#stamp')?.textContent).toBe('PASS');
    expect(container.querySelector('.ctl')?.classList.contains('rev')).toBe(true);
    expect(input(container).readOnly).toBe(false);
    fireEvent.change(input(container), { target: { value: 'ls' } });
    expect(input(container).value).toBe('ls');
    expect(container.querySelector('.ctl')?.classList.contains('rev')).toBe(false);
  });

  it('can be typed into again after a typed plan was run', async () => {
    const { container } = page(recordedLoaders(runs).loaders);
    fireEvent.click(tab('Ghost Shell'));
    await drain();
    advance(40_000);
    fireEvent.change(input(container), { target: { value: 'ls' } });
    fireEvent.click(screen.getByRole('button', { name: '▶ Run ghost' }));
    await drain();
    advance(40_000);
    expect(input(container).readOnly).toBe(false);
    fireEvent.change(input(container), { target: { value: 'ls -la' } });
    expect(input(container).value).toBe('ls -la');
  });

  it('is read-only while a run animates until a click or a focus, and typing then cancels that run', async () => {
    const { container } = page(recordedLoaders(runs).loaders);
    fireEvent.click(tab('Ghost Shell'));
    await drain();
    advance(2_000);
    expect(input(container).readOnly).toBe(true);
    fireEvent.pointerDown(input(container));
    expect(input(container).readOnly).toBe(false);
    fireEvent.change(input(container), { target: { value: 'ls' } });
    expect(input(container).value).toBe('ls');
    // The run is cancelled: nothing of it appears later.
    advance(60_000);
    expect(container.querySelector('#stamp')?.textContent).toBe('');
    expect(container.querySelector('.ctl')?.classList.contains('rev')).toBe(false);
    expect(input(container).value).toBe('ls');
  });

  it('cancels a run that waits for its engine when the visitor types', async () => {
    let release: () => void = () => undefined;
    const recorded = recordedLoaders(runs).loaders;
    const slow: LiveLoaders = {
      ...recorded,
      light: () =>
        new Promise((resolve) => {
          release = () => {
            void recorded.light().then(resolve);
          };
        }),
    };
    const { container } = page(slow);
    fireEvent.click(tab('Ghost Cloud'));
    await drain();
    expect(screen.getByRole('button', { name: '▶ Run ghost' }).getAttribute('aria-busy')).toBe('true');
    fireEvent.change(input(container), { target: { value: 'aws s3 ls' } });
    expect(screen.getByRole('button', { name: '▶ Run ghost' }).getAttribute('aria-busy')).toBe('false');
    release();
    await drain();
    advance(60_000);
    expect(container.querySelector('#stamp')?.textContent).toBe('');
  });
});

describe('step 5 without a fix keeps the copy in the plan after-state', () => {
  it('keeps the deleted objects out of the Cloud copy, and re-copies only for a real second pass', async () => {
    const base = recordedLoaders(runs).loaders;
    const cloud = createCloudEngine({ wardsText: cloudWardsText });
    const loaders: LiveLoaders = {
      ...base,
      light: () => base.light().then((l) => ({ ...l, cloud })),
    };
    const { container } = page(loaders);
    fireEvent.click(tab('Ghost Cloud'));
    await answered(container);
    advance(40_000);
    // The preset has a fix: a second pass re-copies, so the copy shows the fixed run.
    expect(container.querySelector('.ctl')?.classList.contains('rev')).toBe(true);

    fireEvent.change(input(container), { target: { value: 'aws s3 rm s3://prod-logs --recursive' } });
    fireEvent.click(screen.getByRole('button', { name: '▶ Run ghost' }));
    await answered(container);
    // Through step 4: the Verdict has fired (500 ms into step 4).
    advance(2700 + 3900 + 3300 + 600);
    expect(container.querySelector('#stamp')?.textContent).toBe('BLOCKED');
    const logs = () => [...copy(container).querySelectorAll('[data-b="prod-logs"] .objs span')].length;
    expect(logs()).toBe(0);
    const before = snapshot(container);
    // Step 5 of a block-open run.
    advance(2700 + 100);
    expect(container.querySelector('#sayt')?.textContent).toContain('Edit the plan above and run again.');
    expect(snapshot(container)).toEqual(before);
    expect(before).toHaveLength(3);
    expect(logs()).toBe(0);
    // The other buckets keep their objects.
    expect([...copy(container).querySelectorAll('[data-b="prod-assets"] .objs span')].length).toBeGreaterThan(0);
  });
});
