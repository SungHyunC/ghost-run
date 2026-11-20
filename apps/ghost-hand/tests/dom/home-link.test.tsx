// Task 18.2: the hero tag row carries one relative "Ghost Run+ home" link back to the landing page.
// Validates: Requirements 23.2.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import type { AppServices } from '../../src/App';

afterEach(cleanup);

function services(): AppServices {
  return {
    clock: () => new Date(0),
    createWorld: () => Promise.reject(new Error('no engine in this test')),
    createExecutor: () => ({ run: () => Promise.resolve([]), dispose: () => undefined }),
    createOverlay: () => ({ unavailable: true }),
    download: () => undefined,
    wardsText: '',
    variantConfigText: '{}',
    prefersReducedMotion: () => true,
  };
}

describe('Ghost Run+ home link', () => {
  it('renders in the header with the exact text and a relative href', () => {
    render(<App services={services()} />);
    const link = screen.getByRole('link', { name: 'Ghost Run+ home' });
    expect(link.textContent).toBe('Ghost Run+ home');
    expect(link.getAttribute('href')).toBe('../');
    const row = link.parentElement;
    expect(row?.className).toBe('gh-hero-tags');
    expect(row?.closest('header')?.className).toBe('gh-hero');
    expect(row?.querySelector('.gh-eyebrow')?.textContent).toBe('Physics playground');
    expect(link.closest('.gh-brand')).toBeNull();
  });
});
