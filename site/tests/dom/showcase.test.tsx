// Feature: site-pages, Property Pg3: The copy deck is pinned (Showcase part)
// **Validates: Requirements 13.2, 13.4, 13.6, 13.7, 13.8, 13.9, 18.1**
// The input space is finite (the deck strings), so the test enumerates it.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ShowcaseApp } from '../../src/showcase/ShowcaseApp';

afterEach(cleanup);

const CARDS: readonly [string, string, string][] = [
  ['Mirror world', 'Reality vs. the copy', '#p-mirror'],
  ['Candle', 'Go, ask, or stop', '#p-candle'],
  ['Blacklight', 'Hidden letters glow', '#p-blacklight'],
  ['Red thread', 'Step → cause', '#p-thread'],
  ['Graveyard', 'Stopped plans rest here', '#p-grave'],
  ['Lights on', 'Same screens, light theme', '#p-lights'],
];

const ROWS: readonly [string, string, string, readonly string[]][] = [
  ['p-mirror', 'Mirror world', "Reality vs. the ghost's copy, change by change.", ['Losses in red.', 'Secret-like fields hidden.']],
  ['p-candle', 'Candle', 'The verdict at a glance.', ['Pass: lit · Warn: flickering · Block: out', 'Claims show what this run proved.']],
  ['p-blacklight', 'Blacklight', 'Turn it on: hidden letters glow.', ['Zero-width, direction marks, HTML comments.']],
  ['p-thread', 'Red thread', 'From the blocked step to its cause.', ['Literal matches only. Not found is not safe.']],
  ['p-grave', 'Graveyard', 'Every stopped plan rests here.', ['Open a tombstone for the seance.']],
  ['p-lights', 'Lights on', 'Same screens for bright rooms.', ['Colors keep their meaning.']],
  ['p-controls', 'Base controls', 'Buttons and inputs that fit the kit.', []],
];

describe('Showcase page chrome', () => {
  it('shows the hero deck', () => {
    const { container } = render(<ShowcaseApp />);
    expect(screen.getByText("🦴 The skeleton's screen kit")).toBeTruthy();
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]?.textContent).toBe('Every ghost-run app wears the same screens.');
    expect(h1[0]?.querySelector('em')?.textContent).toBe('the same screens');
    expect(screen.getByText('Worlds bring the data. The kit draws it, and never decides.')).toBeTruthy();
    expect([...container.querySelectorAll('.kchips span')].map((c) => c.textContent)).toEqual([
      'Used by Ghost Shell and Ghost Hand',
      '11 render rules',
    ]);
    expect(container.querySelector('.khero-art')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('has the six part cards with hrefs and lines, in the Parts section', () => {
    render(<ShowcaseApp />);
    const parts = screen.getByRole('region', { name: 'Parts' });
    const links = within(parts).getAllByRole('link');
    expect(links.map((a) => [a.querySelector('b')?.textContent, a.querySelector('span')?.textContent, a.getAttribute('href')])).toEqual(
      CARDS.map(([n, l, h]) => [n, l, h]),
    );
  });

  it('has the seven rows in order with ids, headings, leads, and bullets', () => {
    const { container } = render(<ShowcaseApp />);
    const rows = [...container.querySelectorAll('main > section.kpart')];
    expect(rows.map((r) => r.id)).toEqual(ROWS.map((r) => r[0]));
    rows.forEach((row, i) => {
      const [, heading, lead, bullets] = ROWS[i] ?? ['', '', '', []];
      expect(row.querySelectorAll('.kp-text h2')).toHaveLength(1);
      expect(row.querySelector('.kp-text h2')?.textContent).toBe(heading);
      expect(row.querySelector('.kp-lead')?.textContent).toBe(lead);
      expect([...row.querySelectorAll('.kp-text li')].map((l) => l.textContent)).toEqual(bullets);
      expect(row.querySelector('.kp-n')?.getAttribute('aria-hidden')).toBe('true');
      expect(row.classList.contains('flip')).toBe(i % 2 === 1);
      expect(row.querySelectorAll('figure.frame')).toHaveLength(1);
    });
  });

  it('has the landmarks, the footer, and the Gallery link', () => {
    const { container } = render(<ShowcaseApp />);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toBe('The kit lives in ui/.Developer gallery →');
    expect(footer.querySelector('code')?.textContent).toBe('ui/');
    expect(within(footer).getByRole('link', { name: 'Developer gallery →' }).getAttribute('href')).toBe('./gallery/');
    expect(container.querySelectorAll('.kp-text h2')).toHaveLength(7);
  });

  it('keeps the Frame bar free of text, and has no img and no data: URL', () => {
    const { container } = render(<ShowcaseApp />);
    const bars = container.querySelectorAll('.frame-bar');
    expect(bars).toHaveLength(7);
    for (const b of bars) {
      expect(b.textContent).toBe('');
      expect(b.querySelectorAll('i')).toHaveLength(3);
    }
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[src^="data:"], [href^="data:"]')).toBeNull();
  });
});
