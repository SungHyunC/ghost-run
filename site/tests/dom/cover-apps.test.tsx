import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Hero } from '../../src/components/Hero';
import { Nav } from '../../src/components/Nav';

afterEach(cleanup);

describe('cover app links', () => {
  it('shows both apps below the two main buttons with plain relative anchors', () => {
    const { container } = render(<Hero />);
    const shell = screen.getByRole('link', { name: /Ghost Shell.*shell and SQL/ });
    const hand = screen.getByRole('link', { name: /Ghost Hand.*a robot arm/ });
    expect(shell.getAttribute('href')).toBe('shell/');
    expect(hand.getAttribute('href')).toBe('hand/');
    expect(shell.tagName).toBe('A');
    const rows = container.querySelectorAll('.cta');
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#recipe', '#run']);
    expect(within(rows[1] as HTMLElement).getAllByRole('link')).toEqual([shell, hand]);
    expect(shell.classList.contains('btn-main')).toBe(false);
  });

  it('keeps the app links out of the nav', () => {
    render(<Nav current="home" />);
    expect(screen.queryByRole('link', { name: /Ghost (Shell|Hand)/ })).toBeNull();
  });
});
