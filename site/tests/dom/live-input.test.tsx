import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import runsJson from '../../src/data/runs.json';
import type { RunsFile } from '../../src/data/types';
import { drain, recordedLoaders, visibility } from '../lib/live-fakes';

/** Not opened: no engine loads and nothing autoplays; tests drive the box themselves. */
const idle = visibility('cover');
const runs = runsJson as unknown as RunsFile;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount() {
  return render(
    <>
      <Sprite />
      <Walkthrough visibility={idle} runs={runs} loaders={recordedLoaders(runs).loaders} />
    </>,
  );
}

const section = (c: Element) => c.querySelector('#run') as HTMLElement;
const countElements = (c: Element) => section(c).querySelectorAll('*').length;
const type = (c: Element, value: string) => {
  fireEvent.change(c.querySelector('#cmd') as HTMLInputElement, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /Run ghost/ }));
};

// Property L3 (DOM side): typed text appears only as text.
describe('typed text in the page', () => {
  it('an HTML payload shows as text and adds no element', async () => {
    const benign = mount();
    type(benign.container, 'ls build');
    await drain();
    const baseline = countElements(benign.container);
    cleanup();

    const { container } = mount();
    const payload = '<img src=x onerror=alert(1)>';
    type(container, payload);
    await drain();
    expect(container.querySelector('#run img')).toBeNull();
    expect(container.querySelector('#run [onerror]')).toBeNull();
    expect(countElements(container)).toBe(baseline);
    expect((container.querySelector('#cmd') as HTMLInputElement).value).toBe(payload);
  });

  it('an over-limit text shows the explanation and an escaped echo, and adds no element', async () => {
    const { container } = mount();
    type(container, '');
    await drain();
    const baseline = countElements(container);
    type(container, '<b>x</b>' + 'a'.repeat(300));
    await drain();
    const note = container.querySelector('#livenote');
    expect(note?.textContent).toContain('too long');
    expect(container.querySelector('#livenote b')).toBeNull();
    expect(countElements(container)).toBe(baseline);
  });

  it('a hidden character is rejected, echoed as text, and adds no element', async () => {
    const { container } = mount();
    type(container, '');
    await drain();
    const baseline = countElements(container);
    for (const cp of [0x200b, 0x202e, 0xe0041]) {
      type(container, `ls ${String.fromCodePoint(cp)}build`);
      await drain();
      expect(container.querySelector('#livenote')?.textContent).toContain('hidden character');
      expect(countElements(container)).toBe(baseline);
    }
  });

  it('for any text, no injected element appears (property)', async () => {
    const { container } = mount();
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 120 }), async (s) => {
        type(container, s);
        await drain();
        expect(container.querySelector('#run img, #run script, #run [onerror]')).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
