import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KitRoot } from '../../src/components/KitRoot';

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" data-testid="child" onClick={() => setN(n + 1)}>
      {`count ${n}`}
    </button>
  );
}

describe('KitRoot (DOM)', () => {
  it('toggles the theme without remounting children', () => {
    const { container } = render(
      <KitRoot>
        <Counter />
      </KitRoot>,
    );
    const root = container.querySelector('.gk-root')!;
    expect(root.getAttribute('data-theme')).toBe('dark');
    const child = screen.getByTestId('child');
    fireEvent.click(child);
    const sw = screen.getByRole('switch', { name: 'Lights on' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.textContent).toBe('Lights: off');
    fireEvent.click(sw);
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.textContent).toBe('Lights: on');
    expect(screen.getByTestId('child')).toBe(child);
    expect(child.textContent).toBe('count 1');
    fireEvent.click(sw);
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('starts light when initialTheme is light', () => {
    const { container } = render(<KitRoot initialTheme="light" />);
    expect(container.querySelector('.gk-root')!.getAttribute('data-theme')).toBe('light');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falls back to dark with a Placeholder for an invalid initialTheme', () => {
    const bad = 'sepia' as unknown as 'dark';
    const { container } = render(
      <KitRoot initialTheme={bad}>
        <p>kid</p>
      </KitRoot>,
    );
    expect(container.querySelector('.gk-root')!.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('alert').textContent).toBe('Data unavailable: KitRoot received unreadable input.');
    expect(screen.getByText('kid')).toBeTruthy();
  });
});
