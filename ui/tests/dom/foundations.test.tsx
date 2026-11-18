import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitBoundary, withBoundary } from '../../src/components/KitBoundary';
import { Reveal } from '../../src/components/Reveal';
import { createFocusReturnStore, getFocusReturnStore } from '../../src/hooks/useFocusReturn';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { matchMediaListenerCount, setReducedMotion } from '../support/setup-dom';

function Motion() {
  return <i data-testid="m">{String(useReducedMotion())}</i>;
}

function Boom(): never {
  throw new Error('secret-message-CANARY');
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useReducedMotion', () => {
  it('follows matchMedia changes and unsubscribes on unmount', () => {
    const { unmount } = render(<Motion />);
    expect(screen.getByTestId('m').textContent).toBe('false');
    act(() => setReducedMotion(true));
    expect(screen.getByTestId('m').textContent).toBe('true');
    unmount();
    expect(matchMediaListenerCount()).toBe(0);
  });

  it('returns false when matchMedia is missing', () => {
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined });
    try {
      render(<Motion />);
      expect(screen.getByTestId('m').textContent).toBe('false');
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: original });
    }
  });
});

describe('useFocusReturn store', () => {
  it('is one store per document', () => {
    expect(getFocusReturnStore()).toBe(getFocusReturnStore());
  });

  it('stays pending until the tombstone exists, then focuses once', () => {
    const store = createFocusReturnStore(document);
    store.remember(2);
    store.restore();
    const btn = document.createElement('button');
    btn.setAttribute('data-tombstone-index', '2');
    document.body.append(btn);
    expect(document.activeElement).not.toBe(btn);
    store.consume();
    expect(document.activeElement).toBe(btn);
    btn.blur();
    store.restore();
    expect(document.activeElement).not.toBe(btn);
  });

  it('focuses immediately when the element exists', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-tombstone-index', '0');
    document.body.append(btn);
    const store = createFocusReturnStore(document);
    store.remember(0);
    store.restore();
    expect(document.activeElement).toBe(btn);
  });
});

describe('Reveal and boundary', () => {
  it('calls onReveal from a native button', () => {
    const onReveal = vi.fn();
    render(<Reveal shown={1} total={5} noun="rows" onReveal={onReveal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 5 rows' }));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('a throwing child shows only the Placeholder and siblings stay', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Bad = withBoundary(Boom, 'Graveyard');
    render(
      <div>
        <Bad />
        <KitBoundary name="Candle">
          <p>sibling</p>
        </KitBoundary>
      </div>,
    );
    spy.mockRestore();
    expect(screen.getByRole('alert').textContent).toBe('Data unavailable: Graveyard received unreadable input.');
    expect(screen.getByText('sibling')).toBeTruthy();
    expect(document.body.textContent).not.toContain('CANARY');
  });
});
