import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Costumes } from '../../src/components/Costumes';
import { PARTS_MATRIX } from '../../src/data/parts-matrix';
import { visibility } from '../lib/page-visibility';

afterEach(cleanup);

function setup() {
  const { container } = render(<Costumes visibility={visibility('costumes')} />);
  return [...container.querySelectorAll('article.cc')];
}

describe('Costumes section', () => {
  it('shows the sub-heading, the note, and three cards in order', () => {
    const { container } = render(<Costumes visibility={visibility('costumes')} />);
    expect(container.querySelector('.sec-sub')?.textContent).toBe(
      'Same skeleton, new costume. Flip on X-ray.',
    );
    expect(container.querySelector('.cards-note')?.textContent).toBe(
      "Crossed out = not on that app's screen.",
    );
    expect([...container.querySelectorAll('.cc h3')].map((h) => h.textContent)).toEqual([
      'Ghost Shell',
      'Ghost Hand',
      'Ghost Cloud',
    ]);
  });

  it('shows costume tag, world line, chips, Kiro line, and button per card in order', () => {
    const cards = setup();
    for (const c of cards) {
      expect([...c.children].map((e) => e.className)).toEqual(['cc-art', '', 'cos', 'wl', 'used', 'kiro', 'btn small']);
      expect(c.querySelector('.cc-tag, .used-t, .wl small')).toBeNull();
    }
    expect(
      cards.map((c) => ({
        cos: c.querySelector('.cos')?.textContent,
        world: c.querySelector('.wl div')?.textContent,
        kiro: c.querySelector('.kiro')?.textContent,
        link: [c.querySelector('a')?.textContent, c.querySelector('a')?.getAttribute('href')],
      })),
    ).toEqual([
      { cos: 'Hacker hoodie', world: 'Files + SQLite', kiro: 'Kiro spec: ghost-shell', link: ['Open Ghost Shell →', 'shell/'] },
      {
        cos: 'Robot suit',
        world: 'Robot arm, 8 haunted copies',
        kiro: 'Kiro spec: ghost-hand',
        link: ['Open Ghost Hand →', 'hand/'],
      },
      {
        cos: 'Cloud + bucket hat',
        world: 'S3 buckets in memory',
        kiro: 'Kiro agent: world-smith',
        link: ['How it was made →', '#make'],
      },
    ]);
  });

  it('lists the six chips in order and marks not-used chips from the matrix', () => {
    const order = ['Mirror', 'Ghost', 'Wards', 'Candle', 'Blacklight', 'Graveyard'];
    const keys = ['shell', 'hand', 'cloud'] as const;
    setup().forEach((card, i) => {
      const chips = [...card.querySelectorAll('.used > span')];
      expect(chips.map((c) => c.textContent?.replace(' not used', ''))).toEqual(order);
      const matrix = PARTS_MATRIX[keys[i] as (typeof keys)[number]];
      const parts = ['mirror', 'ghost', 'wards', 'candle', 'blacklight', 'graveyard'] as const;
      chips.forEach((chip, j) => {
        const used = matrix[parts[j] as (typeof parts)[number]];
        expect(chip.classList.contains('off')).toBe(!used);
        const hidden = chip.querySelector('.sr-only');
        expect(hidden?.textContent?.trim()).toBe(used ? undefined : 'not used');
      });
    });
    const hand = setup()[1]?.querySelectorAll('.used > span.off');
    expect(hand?.length).toBe(2);
  });

  it('draws the three figures over the same bones symbol', () => {
    const uses = [...document.querySelectorAll('.cc-art svg.fig use')];
    expect(uses).toHaveLength(0);
    setup();
    const refs = [...document.querySelectorAll('.cc-art svg.fig use')].map((u) => u.getAttribute('href'));
    expect(refs).toEqual(['#bones', '#bones', '#bones']);
  });
});
