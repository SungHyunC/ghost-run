import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { DUR } from '../../src/config';
import { DUR as ENGINE_DUR } from '../../src/engine/script';

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(here, '../../index.html'), 'utf8');

afterEach(cleanup);

// Structural classes of the Mockup (Requirement 2, criterion 7).
const STRUCTURAL = [
  'site', 'nav', 'hero', 'sec', 'recipe', 'ing', 'parts', 'part', 'cards', 'cc', 'costume', 'theater', 'panes',
  'pane', 'ward', 'verdict', 'actor', 'say', 'rail', 'wchip', 'xsw',
];

describe('DUR', () => {
  it('equals the Mockup step durations', () => {
    expect([...DUR]).toEqual([2700, 3900, 3300, 2700, 5200]);
    expect([...ENGINE_DUR]).toEqual([2700, 3900, 3300, 2700, 5200]);
  });
});

describe('structural classes', () => {
  it.each(STRUCTURAL)('renders at least one element with class "%s"', (cls) => {
    const { container } = render(<App />);
    expect(container.querySelector(`.${cls}`), cls).not.toBeNull();
  });

  it('has no mockup wrapper', () => {
    const { container } = render(<App />);
    for (const cls of ['doc', 'guide', 'guide-t', 'hint']) {
      expect(container.querySelector(`.${cls}`), cls).toBeNull();
    }
  });
});

describe('page order and headings', () => {
  it('renders the seven blocks in the order of Requirement 4', () => {
    const { container } = render(<App />);
    const blocks = [...(container.querySelector('.site > .page')?.children ?? [])];
    expect(blocks.map((b) => b.tagName.toLowerCase() + (b.id === '' ? '' : `#${b.id}`))).toEqual([
      'nav',
      'header',
      'section#recipe',
      'section#costumes',
      'section#run',
      'section#make',
      'footer',
    ]);
    expect(blocks[0]?.classList.contains('nav')).toBe(true);
    expect(blocks[1]?.classList.contains('hero')).toBe(true);
    expect(blocks[6]?.classList.contains('foot')).toBe(true);
  });

  it('has one h1 and one h2 per numbered section', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    const sections = [...container.querySelectorAll('section.sec')];
    expect(sections.map((s) => s.id)).toEqual(['recipe', 'costumes', 'run', 'make']);
    for (const [k, s] of sections.entries()) {
      expect(s.querySelectorAll('h2'), s.id).toHaveLength(1);
      expect(s.querySelector('.nbadge')?.textContent, s.id).toBe(String(k + 1));
    }
    expect(container.querySelectorAll('h2')).toHaveLength(4);
  });
});

describe('document', () => {
  it('declares lang en and the exact title', () => {
    expect(indexHtml).toMatch(/<html[^>]*\slang="en"/);
    expect(indexHtml).toContain("<title>Ghost Run+: let your agent's ghost try it first</title>");
  });
});
