import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_URL } from '../../src/config';
import { Nav } from '../../src/components/Nav';

afterEach(cleanup);

const hrefs = (): Record<string, string | null> =>
  Object.fromEntries(['Home', 'UI Kit', 'GitHub'].map((n) => [n, screen.getByRole('link', { name: n }).getAttribute('href')]));

describe('shared Nav', () => {
  it('uses the relative hrefs of /kit/ and marks UI Kit as current', () => {
    render(<Nav current="kit" root="../" />);
    expect(hrefs()).toEqual({ Home: '../', 'UI Kit': './', GitHub: REPO_URL });
    const kit = screen.getByRole('link', { name: 'UI Kit' });
    expect(kit.classList.contains('on')).toBe(true);
    expect(kit.getAttribute('aria-current')).toBe('page');
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('keeps the values of today on /', () => {
    render(<Nav current="home" />);
    expect(hrefs()).toEqual({ Home: './', 'UI Kit': 'kit/', GitHub: REPO_URL });
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'UI Kit' }).hasAttribute('aria-current')).toBe(false);
  });
});
