import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { scanText } from '@ghost-run/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlacklightView } from '../../src/components/BlacklightView';
import { Candle } from '../../src/components/Candle';
import { KitRoot } from '../../src/components/KitRoot';
import { SeanceView } from '../../src/components/SeanceView';

// Requirements 11.2, 11.3, 11.4, 11.7, 11.8, 14.2.

const TEXT = `plain line\nhidden${String.fromCodePoint(0x200b)}zero width\n`;
const ENTRY = {
  id: 'a1',
  command: 'rm -rf data',
  recordedAt: '2026-01-02T03:04:05Z',
  wardIds: ['protect-data'],
};

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" data-testid="child" onClick={() => setN(n + 1)}>
      {`count ${n}`}
    </button>
  );
}

function rootOf(container: HTMLElement): HTMLElement {
  return container.querySelector('.gk-root') as HTMLElement;
}

function SeanceHost() {
  const [open, setOpen] = useState(true);
  return open ? <SeanceView entry={ENTRY} onBack={() => setOpen(false)} /> : <p>closed</p>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('theme switching (DOM)', () => {
  it('starts in dark by default and in the theme of initialTheme (11.2)', () => {
    const a = render(<KitRoot />);
    expect(rootOf(a.container).getAttribute('data-theme')).toBe('dark');
    a.unmount();
    const b = render(<KitRoot initialTheme="light" />);
    expect(rootOf(b.container).getAttribute('data-theme')).toBe('light');
    expect(screen.getByRole('switch', { name: 'Lights on' }).getAttribute('aria-checked')).toBe('true');
    b.unmount();
    const c = render(<KitRoot initialTheme="dark" />);
    expect(rootOf(c.container).getAttribute('data-theme')).toBe('dark');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('flips data-theme in the same commit as the toggle (11.3)', () => {
    const { container } = render(<KitRoot />);
    const root = rootOf(container);
    const sw = screen.getByRole('switch', { name: 'Lights on' });
    // fireEvent wraps the click in act(): the DOM must be final right after it returns.
    fireEvent.click(sw);
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('keeps the Blacklight state, the open seance, and child node identity across toggles (11.4)', () => {
    const scan = scanText(TEXT);
    const { container } = render(
      <KitRoot>
        <Counter />
        <BlacklightView sources={[{ source: 'notes.txt', text: TEXT, scan }]} />
        <SeanceHost />
      </KitRoot>,
    );
    const root = rootOf(container);
    const child = screen.getByTestId('child');
    fireEvent.click(child);
    const blacklight = screen.getByRole('switch', { name: 'Blacklight' });
    fireEvent.click(blacklight);
    expect(blacklight.getAttribute('aria-checked')).toBe('true');
    const heading = screen.getByRole('heading', { name: 'Seance' });
    expect(document.activeElement).toBe(heading);

    fireEvent.click(screen.getByRole('switch', { name: 'Lights on' }));
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(screen.getByTestId('child')).toBe(child);
    expect(child.textContent).toBe('count 1');
    expect(screen.getByRole('switch', { name: 'Blacklight' })).toBe(blacklight);
    expect(blacklight.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Seance' })).toBe(heading);
    expect(within(root).getByText('rm -rf data')).toBeTruthy();
    expect(document.activeElement).toBe(heading);

    fireEvent.click(screen.getByRole('switch', { name: 'Lights on' }));
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByTestId('child')).toBe(child);
    expect(blacklight.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Seance' })).toBe(heading);
  });

  it('starts dark and shows the KitRoot Placeholder for an invalid initialTheme (14.2)', () => {
    const bad = 'sepia' as unknown as 'dark';
    const { container } = render(
      <KitRoot initialTheme={bad}>
        <p>kid</p>
      </KitRoot>,
    );
    expect(rootOf(container).getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('alert').textContent).toBe('Data unavailable: KitRoot received unreadable input.');
    expect(screen.getByText('kid')).toBeTruthy();
    // The toggle still works from the dark fallback.
    fireEvent.click(screen.getByRole('switch', { name: 'Lights on' }));
    expect(rootOf(container).getAttribute('data-theme')).toBe('light');
  });

  it('writes nothing to storage or cookies when the theme changes (11.8)', () => {
    const calls: string[] = [];
    const spies = (['setItem', 'removeItem', 'clear'] as const).map((m) =>
      vi.spyOn(Storage.prototype, m).mockImplementation(() => {
        calls.push(m);
      }),
    );
    const cookieSet = vi.fn();
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: cookieSet });
    try {
      render(<KitRoot initialTheme="light" />);
      const sw = screen.getByRole('switch', { name: 'Lights on' });
      fireEvent.click(sw);
      fireEvent.click(sw);
    } finally {
      delete (document as unknown as Record<string, unknown>)['cookie'];
      if (desc !== undefined) Object.defineProperty(Document.prototype, 'cookie', desc);
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(cookieSet).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('keeps all five candle states distinguishable by icon and text in both themes (11.7)', () => {
    const verdicts: { verdict: unknown; text: string; icon: string }[] = [
      { verdict: { verdict: 'pass', violations: [], notices: [] }, text: 'PASS', icon: 'candle-lit' },
      { verdict: { verdict: 'warn', violations: [], notices: [] }, text: 'WARN', icon: 'candle-flicker' },
      { verdict: { verdict: 'block', violations: [], notices: [] }, text: 'BLOCK', icon: 'candle-out' },
      { verdict: { verdict: 'bogus', violations: [], notices: [] }, text: 'UNKNOWN', icon: 'candle-unknown' },
      { verdict: undefined, text: 'NO VERDICT', icon: 'candle-idle' },
    ];
    const { container } = render(
      <KitRoot>
        {verdicts.map((v, i) => (
          <div key={i} data-testid={`candle-${i}`}>
            <Candle verdict={v.verdict as never} />
          </div>
        ))}
      </KitRoot>,
    );
    const root = rootOf(container);
    const sw = screen.getByRole('switch', { name: 'Lights on' });
    const seen = new Set<string>();
    for (const theme of ['dark', 'light']) {
      expect(root.getAttribute('data-theme')).toBe(theme);
      const icons: string[] = [];
      const texts: string[] = [];
      verdicts.forEach((v, i) => {
        const label = screen.getByTestId(`candle-${i}`).querySelector('.gk-candle-label') as HTMLElement;
        expect(label.textContent).toBe(v.text);
        expect(label.querySelector('svg')?.getAttribute('data-icon')).toBe(v.icon);
        icons.push(v.icon);
        texts.push(label.textContent ?? '');
      });
      expect(new Set(icons).size).toBe(5);
      expect(new Set(texts).size).toBe(5);
      seen.add(theme);
      act(() => {
        sw.click();
      });
    }
    expect(seen.size).toBe(2);
  });
});
