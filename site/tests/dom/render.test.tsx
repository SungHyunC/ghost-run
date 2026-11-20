import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { REPO_URL } from '../../src/config';

const here = dirname(fileURLToPath(import.meta.url));

afterEach(cleanup);

describe('App shell and nav', () => {
  it('has the .site and .page wrappers with the sprite first', () => {
    const { container } = render(<App />);
    const site = container.querySelector('.site');
    expect(site).not.toBeNull();
    expect(site?.firstElementChild?.classList.contains('sprite')).toBe(true);
    const page = container.querySelector('.site > .page');
    expect(page).not.toBeNull();
    expect(page?.firstElementChild?.classList.contains('nav')).toBe(true);
  });

  it('renders the five nav links with their targets', () => {
    const { container } = render(<App />);
    const links = [...container.querySelectorAll('.nav-links a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Home', './'],
      ['Ghost Shell', 'shell/'],
      ['Ghost Hand', 'hand/'],
      ['UI Kit', 'kit/'],
      ['GitHub', REPO_URL],
    ]);
    expect(links[4]?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('marks only Home as current', () => {
    const { container } = render(<App />);
    const current = [...container.querySelectorAll('.nav-links a[aria-current]')];
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe('Home');
    expect(current[0]?.getAttribute('aria-current')).toBe('page');
    expect(container.querySelectorAll('.nav-links a.on')).toHaveLength(1);
  });

  it('shows the logo text', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.logo')?.textContent).toBe('Ghost Run+');
  });
});

describe('Hero', () => {
  it('renders the kicker, the one h1, and the paragraph with bold words', () => {
    const { container } = render(<App />);
    const hero = container.querySelector('header.hero');
    expect(hero).not.toBeNull();
    expect(container.querySelector('.kicker')?.textContent).toContain('Kiroween 2026 · Skeleton Crew');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('h1')?.textContent).toBe("Let your agent's ghost try it first.");
    const p = hero?.querySelector('p');
    expect(p?.textContent).toBe(
      'A Kiro template for apps that rehearse risky plans on a ghost copy of the world. One skeleton, three costumes.',
    );
    expect([...(p?.querySelectorAll('b') ?? [])].map((b) => b.textContent)).toEqual([
      'ghost copy',
      'One skeleton, three costumes.',
    ]);
  });

  it('has the two buttons with their targets', () => {
    const { container } = render(<App />);
    const links = [...container.querySelectorAll('.hero .cta a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Meet the skeleton', '#recipe'],
      ['Watch the ghost work', '#run'],
    ]);
  });

  it('follows the nav and hides every decorative svg', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.page')?.children[1]?.classList.contains('hero')).toBe(true);
    const svgs = [...container.querySelectorAll('header.hero svg')];
    expect(svgs.length).toBeGreaterThan(0);
    for (const s of svgs) {
      expect(s.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(container.querySelectorAll('.hero-art .bat')).toHaveLength(3);
    expect(container.querySelectorAll('.pk-row svg')).toHaveLength(3);
  });

  it('contains no hidden Unicode character in the rendered text', () => {
    const { container } = render(<App />);
    const text = container.textContent ?? '';
    expect(/[\u200B\u200C\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/u.test(text)).toBe(false);
    expect(/[\u{E0000}-\u{E007F}]/u.test(text)).toBe(false);
  });
});

describe('Recipe', () => {
  it('has one h2 and the sub-heading, and the signs are aria-hidden', () => {
    const { container } = render(<App />);
    const sec = container.querySelector('section#recipe');
    expect(sec).not.toBeNull();
    expect(sec?.querySelectorAll('h2')).toHaveLength(1);
    expect(sec?.querySelector('h2')?.textContent).toBe("What's in the skeleton?");
    expect(sec?.querySelector('.sec-sub')?.textContent).toBe('Every ghost-run app is a recipe with two ingredients.');
    expect([...(sec?.querySelectorAll('h3') ?? [])].map((h) => h.textContent)).toEqual([
      'Your world',
      'The skeleton',
      'Your ghost-run app',
    ]);
    const ops = [...(sec?.querySelectorAll('.op') ?? [])];
    expect(ops.map((o) => [o.textContent, o.getAttribute('aria-hidden')])).toEqual([
      ['+', 'true'],
      ['=', 'true'],
    ]);
    for (const s of sec?.querySelectorAll('svg') ?? []) {
      expect(s.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('lists the six functions in order with their lines', () => {
    const { container } = render(<App />);
    const rows = [...container.querySelectorAll('#recipe .fnl li')];
    expect(rows.map((r) => [r.querySelector('code')?.textContent, r.textContent])).toEqual([
      ['snapshot', 'snapshotcopy reality'],
      ['step', 'steptry one action on the copy'],
      ['diff', 'diffwhat changed'],
      ['render', 'renderdraw it for the screens'],
      ['fingerprint', 'fingerprintprove reality stayed the same'],
      ['effectsOutside', 'effectsOutsidewhat would leave the box'],
    ]);
  });

  it('shows eight parts in order with lines and folders', () => {
    const { container } = render(<App />);
    const parts = [...container.querySelectorAll('#recipe .part')];
    expect(parts.map((p) => p.querySelector('b')?.textContent)).toEqual([
      'Mirror',
      'Ghost',
      'Wards',
      'Candle',
      'Blacklight',
      'Graveyard',
      'Kiro hook',
      'world-smith',
    ]);
    expect(parts[1]?.querySelector('span')?.textContent).toBe('Runs the plan on the copy, in a Docker box for real files.');
    expect(parts[1]?.querySelector('i')?.textContent).toBe('core/ · ghost-runner/');
    expect(parts[7]?.querySelector('i')?.textContent).toBe('.kiro/agents/');
    for (const p of parts) expect(p.querySelector('svg use')).not.toBeNull();
  });

  it('names the six specs and the cauldron text', () => {
    const { container } = render(<App />);
    const built = container.querySelector('#recipe .built');
    expect(built?.textContent?.startsWith('Built with Kiro specs:')).toBe(true);
    expect([...(built?.querySelectorAll('code') ?? [])].map((c) => c.textContent)).toEqual([
      'core-contract',
      'ghost-runner',
      'wards',
      'possession',
      'ui-kit',
      'kiro-integration',
    ]);
    expect(container.querySelector('#recipe .result p')?.textContent).toBe(
      'It copies the world, lets a ghost try the plan, judges it with your wards, and shows the verdict as a candle.',
    );
  });

  it('shows the rounded committed count and holds no literal count in the source', () => {
    const { container } = render(<App />);
    const size = JSON.parse(readFileSync(resolve(here, '../../src/data/world-size.json'), 'utf8')) as {
      worlds: Record<string, number>;
    };
    const n = Math.round((size.worlds['ghost-cloud'] ?? 0) / 100) * 100;
    expect(container.querySelector('#recipe .lean')?.textContent).toBe(
      `🎃 That's all. Ghost Cloud's whole world is about ${n} lines.`,
    );
    const src = readFileSync(resolve(here, '../../src/components/Recipe.tsx'), 'utf8');
    expect(/about\s+\d/.test(src)).toBe(false);
    expect(src.includes(String(size.worlds['ghost-cloud']))).toBe(false);
    expect(src.includes(String(n))).toBe(false);
  });
});

describe('Make and Footer', () => {
  it('shows the sub-heading and the spellbook code block', () => {
    const { container } = render(<App />);
    const sec = container.querySelector('section#make');
    expect(sec?.querySelectorAll('h2')).toHaveLength(1);
    expect(sec?.querySelector('h2')?.textContent).toBe('Make your own costume');
    expect(sec?.querySelector('.sec-sub')?.textContent).toBe('Write six functions, or let a Kiro agent write them with you.');
    expect(sec?.querySelector('.book-t')?.textContent).toBe('📖 The spell: a world in six functions');
    expect(sec?.querySelector('.book pre')?.textContent).toBe(
      [
        'const myWorld: World<MyState, MyAction> = {',
        '  snapshot,       // copy reality, never touch it',
        '  step,           // try one action on the copy',
        '  diff,           // what changed',
        "  render,         // a scene for the skeleton's screens",
        '  fingerprint,    // prove reality stayed the same',
        '  effectsOutside, // what would leave the box',
        '};',
      ].join('\n'),
    );
    expect(sec?.querySelectorAll('.book pre .c')).toHaveLength(6);
  });

  it('shows the world-smith card and offers no control', () => {
    const { container } = render(<App />);
    const sec = container.querySelector('section#make');
    expect(sec?.querySelector('.agent h3')?.textContent).toBe('Ask world-smith');
    expect(sec?.querySelector('.agent p')?.textContent).toBe(
      'A Kiro custom agent. It copies the spec template, writes the world with you one file at a time, and runs the registration gate and the wards.',
    );
    expect(sec?.querySelector('.agent code.cmd')?.textContent).toBe('kiro-cli chat --agent world-smith');
    expect(sec?.querySelector('.agent .proof')?.textContent).toBe('🎃 Ghost Cloud was made this way.');
    expect(sec?.querySelectorAll('button, form, input, textarea, select')).toHaveLength(0);
  });

  it('puts the footer last with the seven items in order', () => {
    const { container } = render(<App />);
    const page = container.querySelector('.page');
    const foot = page?.lastElementChild;
    expect(foot?.tagName).toBe('FOOTER');
    expect(foot?.classList.contains('foot')).toBe(true);
    expect(foot?.textContent?.startsWith('Built with Kiro:')).toBe(true);
    expect([...(foot?.querySelectorAll('span') ?? [])].map((s) => s.textContent)).toEqual([
      'specs',
      'hooks',
      'steering',
      'MCP',
      'power',
      'custom agent',
      'property tests',
    ]);
    expect(page?.querySelector('section#make')?.nextElementSibling).toBe(foot);
  });
});
