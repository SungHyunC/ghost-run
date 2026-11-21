import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import links from '../../src/data/kit-links.json';
import { ShowcaseApp } from '../../src/showcase/ShowcaseApp';

afterEach(cleanup);

describe('data/kit-links.json', () => {
  it('equals the links and row ids of the rendered Showcase', () => {
    const { container } = render(<ShowcaseApp />);
    const rendered = [...container.querySelectorAll('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((h) => !h.startsWith('http'));
    expect(links.from).toBe('kit/index.html');
    expect(rendered).toEqual(links.links);
    expect([...container.querySelectorAll('main > section.kpart')].map((s) => s.id)).toEqual(links.rowIds);
  });
});
