// Reduced-motion hook wiring in the art components. jsdom does not evaluate media queries,
// so the CSS side is covered by the stylesheet task.
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FlameArt } from '../../src/components/art/FlameArt';
import { SmokeLayer } from '../../src/components/art/SmokeLayer';
import { MirrorWorld } from '../../src/components/MirrorWorld';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { setReducedMotion } from '../support/setup-dom';

const original = window.matchMedia;

function setMatchMedia(value: unknown): void {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value });
}

afterEach(() => {
  // The setup file resets the reduced flag and listeners after each test.
  setMatchMedia(original);
});

function Probe() {
  return <i data-testid="probe">{String(useReducedMotion())}</i>;
}

const deletion = [[{ kind: 'file-deleted', path: 'data/users.db' }]] as never;

function renderMirror() {
  const view = render(<MirrorWorld changes={deletion} />);
  const label = Array.from(view.container.querySelectorAll('span')).find((s) => s.textContent === 'would be removed');
  return { view, label };
}

describe('reduced motion', () => {
  it('sets data-motion="reduce" on FlameArt and SmokeLayer when the preference is reduce', () => {
    setReducedMotion(true);
    const { container } = render(
      <>
        <FlameArt state="lit" />
        <SmokeLayer />
      </>,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(2);
    for (const svg of Array.from(svgs)) expect(svg.getAttribute('data-motion')).toBe('reduce');
  });

  it('omits data-motion without the preference and reacts to a live change', () => {
    const { container } = render(
      <>
        <FlameArt state="flickering" />
        <SmokeLayer />
      </>,
    );
    const svgs = Array.from(container.querySelectorAll('svg'));
    for (const svg of svgs) expect(svg.hasAttribute('data-motion')).toBe(false);
    act(() => setReducedMotion(true));
    for (const svg of svgs) expect(svg.getAttribute('data-motion')).toBe('reduce');
  });

  it('returns false and does not throw when matchMedia is missing', () => {
    setMatchMedia(undefined);
    const { getByTestId, container } = render(
      <>
        <Probe />
        <FlameArt state="out" />
        <SmokeLayer />
      </>,
    );
    expect(getByTestId('probe').textContent).toBe('false');
    for (const svg of Array.from(container.querySelectorAll('svg'))) expect(svg.hasAttribute('data-motion')).toBe(false);
  });

  it('keeps the vanish label and icon with reduced motion on and off', () => {
    for (const reduced of [false, true]) {
      setReducedMotion(reduced);
      const { view, label } = renderMirror();
      expect(label).toBeTruthy();
      const tag = label?.parentElement;
      expect(tag?.querySelector('svg[data-icon="cloud"]')).toBeTruthy();
      const smoke = view.container.querySelector('td.gk-cell-mirror > svg');
      expect(smoke?.getAttribute('data-motion')).toBe(reduced ? 'reduce' : null);
      view.unmount();
    }
  });

  it('keeps the vanish label and icon when matchMedia is missing', () => {
    setMatchMedia(undefined);
    const { label } = renderMirror();
    expect(label).toBeTruthy();
    expect(label?.parentElement?.querySelector('svg[data-icon="cloud"]')).toBeTruthy();
  });
});
