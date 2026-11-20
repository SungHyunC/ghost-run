import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const describe_ = (el: Element): string => `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''}#${el.id}`;

describe('page accessibility', () => {
  it('hides the sprite and every decorative svg', () => {
    const { container } = render(<App />);
    const sprite = container.querySelector('.sprite');
    expect(sprite?.getAttribute('aria-hidden')).toBe('true');
    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs.length).toBeGreaterThan(20);
    for (const s of svgs) expect(s.closest('[aria-hidden="true"]'), s.getAttribute('class') ?? 'svg').not.toBeNull();
  });

  it('puts the rail buttons inside an ordered list', () => {
    const { container } = render(<App />);
    const buttons = [...container.querySelectorAll('#rail button')];
    expect(buttons).toHaveLength(5);
    for (const b of buttons) {
      expect(b.parentElement?.tagName).toBe('LI');
      expect(b.parentElement?.parentElement?.tagName).toBe('OL');
    }
  });

  it('shows "not used" text in every crossed-out chip', () => {
    const { container } = render(<App />);
    const off = [...container.querySelectorAll('.used > span.off')];
    expect(off.length).toBeGreaterThan(0);
    for (const c of off) expect(c.textContent).toContain('not used');
    for (const c of container.querySelectorAll('.used > span:not(.off)')) expect(c.textContent).not.toContain('not used');
  });

  it('shows the verdict and the check rows as text', () => {
    const { container } = render(<App />);
    expect(container.querySelector('#verdict #stamp')).not.toBeNull();
    expect(container.querySelector('#verdict #vnote')).not.toBeNull();
    expect(container.querySelector('#ward #checks')).not.toBeNull();
    for (const row of container.querySelectorAll('#checks .chk')) {
      expect(row.classList.contains('ok') || row.classList.contains('bad')).toBe(true);
      expect(row.querySelector('em')?.textContent).toMatch(/[\u2713\u2717]$/u);
    }
  });

  it('reaches every link, button, and the switch with the Tab key', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const expected = [...container.querySelectorAll<HTMLElement>('a[href], button, input')];
    expect(expected.length).toBeGreaterThan(10);
    expect(container.querySelector('#xray')).not.toBeNull();
    for (const el of expected) {
      expect(el.hasAttribute('disabled'), describe_(el)).toBe(false);
      expect(Number(el.getAttribute('tabindex') ?? 0), describe_(el)).toBeGreaterThanOrEqual(0);
    }
    const reached = new Set<Element>();
    for (let i = 0; i < expected.length + 5; i++) {
      await user.tab();
      if (document.activeElement !== null) reached.add(document.activeElement);
    }
    for (const el of expected) expect(reached.has(el), describe_(el)).toBe(true);
  });

  it('sets style attributes only through the CSSOM of known elements', () => {
    const { container } = render(<App />);
    const styled = [...container.querySelectorAll('[style]')];
    expect(container.querySelector('#actor')?.hasAttribute('style')).toBe(true);
    for (const el of styled) {
      if (el.id === 'actor') continue;
      const st = (el as HTMLElement).style;
      const props = Array.from({ length: st.length }, (_, i) => st.item(i));
      // Pane items set only the --i index property; the copy pane toggles visibility.
      expect(props.every((p) => p === '--i' || p === 'visibility'), describe_(el)).toBe(true);
    }
    expect(container.querySelector('.sprite')?.hasAttribute('style')).toBe(false);
  });

  it('hides the Actor from the accessibility tree', () => {
    const { container } = render(<App />);
    expect(container.querySelector('#actor')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('#sayt')?.getAttribute('aria-live')).toBe('polite');
  });
});
