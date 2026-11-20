import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Costumes } from '../../src/components/Costumes';
import { PARTS_MATRIX } from '../../src/data/parts-matrix';

afterEach(cleanup);

function setup() {
  const { container } = render(<Costumes lineCount={800} />);
  return [...container.querySelectorAll('article.cc')];
}

describe('Costumes section', () => {
  it('shows the sub-heading, the note, and three cards in order', () => {
    const { container } = render(<Costumes lineCount={800} />);
    expect(container.querySelector('.sec-sub')?.textContent).toBe(
      'Each app is the same skeleton in a different costume. Turn on X-ray to see the bones.',
    );
    expect(container.querySelector('.cards-note')?.textContent).toBe(
      "Crossed-out parts are not on that app's screen. The costume is what each app adds: its world and its own screens.",
    );
    expect([...container.querySelectorAll('.cc h3')].map((h) => h.textContent)).toEqual([
      'Ghost Shell',
      'Ghost Hand',
      'Ghost Cloud',
    ]);
  });

  it('shows tag, costume, world line, folder, provenance, and link per card', () => {
    const cards = setup().map((c) => ({
      tag: c.querySelector('.cc-tag')?.textContent,
      cos: c.querySelector('.cos')?.textContent,
      world: c.querySelector('.wl div')?.firstChild?.textContent,
      folder: c.querySelector('.wl small')?.textContent,
      used: c.querySelector('.used-t')?.textContent,
      kiro: c.querySelector('.kiro')?.textContent,
      link: [c.querySelector('a')?.textContent, c.querySelector('a')?.getAttribute('href')],
    }));
    expect(cards).toEqual([
      {
        tag: 'App 1',
        cos: 'Costume: hacker hoodie',
        world: 'World: files + SQLite in the browser',
        folder: 'worlds/playground-shell',
        used: 'Skeleton parts on its screen',
        kiro: 'Built with the Kiro spec ghost-shell',
        link: ['Open Ghost Shell →', 'shell/'],
      },
      {
        tag: 'App 2',
        cos: 'Costume: robot suit',
        world: 'World: a MuJoCo robot arm, 8 haunted copies',
        folder: 'worlds/drawer-arm',
        used: 'Skeleton parts on its screen',
        kiro: 'Built with the Kiro spec ghost-hand',
        link: ['Open Ghost Hand →', 'hand/'],
      },
      {
        tag: '3rd world',
        cos: 'Costume: a cloud and a bucket hat',
        world: 'World: S3 buckets in memory, about 800 lines',
        folder: 'worlds/ghost-cloud',
        used: 'Skeleton parts it uses (no screen yet)',
        kiro: 'Built by the Kiro agent world-smith',
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
