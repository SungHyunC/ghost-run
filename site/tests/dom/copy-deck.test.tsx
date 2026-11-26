// Property Pg3: the copy deck is pinned (landing part).
// The deck is finite, so the property is enumerated: every page as the current page,
// with X-ray off and on (10 states), is checked against the literals below.
// The literals come from docs/design/pages-brief.md section C and Requirement 11.
// They are written here on purpose and are not read from the data modules.
// **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 12.4**
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { COSTUMES_HEADS, COVER, MAKE_HEADS, RECIPE_HEADS, RUN_HEADS } from '../../src/data/copy';
import { PAGE_IDS, type PageId } from '../../src/data/pages';
import { COSTUME_CARDS, SKELETON_PARTS, SPEC_NAMES, WORLD_FUNCTIONS } from '../../src/data/skeleton';
import worldSize from '../../src/data/world-size.json';
import { roundLines } from '../../src/engine/format';

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  Object.defineProperty(window, 'scrollTo', { configurable: true, writable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'matchMedia');
});

// ---- The deck, as literals ------------------------------------------------------------------

const EXPECTED = {
  cover: {
    kicker: '🎃 Kiroween 2026 · Skeleton Crew',
    heading: "Let your agent's ghost try it first.",
    em: 'ghost',
    before: 'A Kiro template where a ghost tries risky plans on a copy first. ',
    bold: 'One skeleton, three costumes.',
    primary: { name: 'Meet the skeleton', href: '#recipe' },
    secondary: { name: 'Watch the ghost work', href: '#run' },
  },
  recipe: {
    heading: "What's in the skeleton?",
    sub: 'Your world + the skeleton = a ghost-run app.',
    worldTitle: 'Your world',
    worldSub: 'Six functions.',
    functions: [
      ['snapshot', 'copy reality'],
      ['step', 'try one action'],
      ['diff', 'what changed'],
      ['render', 'draw it'],
      ['fingerprint', 'prove reality is untouched'],
      ['effectsOutside', 'what leaves the box'],
    ],
    skeletonTitle: 'The skeleton',
    skeletonSub: 'Ready-made and wired.',
    parts: [
      ['Mirror', 'Copy and compare'],
      ['Ghost', 'Try the plan on the copy'],
      ['Wards', 'Rules that say no'],
      ['Candle', 'Go, ask, or stop'],
      ['Blacklight', 'Find hidden instructions'],
      ['Graveyard', 'Remember stopped plans'],
      ['Kiro hook', 'Stop risky commands in Kiro'],
      ['world-smith', 'A Kiro agent that builds worlds'],
    ],
    chip: 'Built from 6 of our 14 Kiro specs',
    chipTitle: 'core-contract, ghost-runner, wards, possession, ui-kit, kiro-integration',
    resultTitle: 'Your ghost-run app',
    resultText: 'Copy → try → judge → candle.',
  },
  costumes: {
    heading: 'One skeleton, three costumes',
    sub: 'Same skeleton, new costume. Flip on X-ray.',
    legend: "Crossed out = not on that app's screen.",
    cards: [
      ['Ghost Shell', 'Hacker hoodie', 'Files + SQLite', 'Kiro spec: ghost-shell', 'Open Ghost Shell →', 'shell/'],
      [
        'Ghost Hand',
        'Robot suit',
        'Robot arm, 8 haunted copies',
        'Kiro spec: ghost-hand',
        'Open Ghost Hand →',
        'hand/',
      ],
      ['Ghost Cloud', 'Cloud + bucket hat', 'S3 buckets in memory', 'Kiro agent: world-smith', 'How it was made →', '#make'],
    ],
  },
  run: {
    heading: 'Watch the ghost work',
    sub: 'Give the ghost a plan. It tries it on a copy first.',
  },
  make: {
    heading: 'Make your own costume',
    sub: 'Write six functions, or let a Kiro agent help.',
    spellbook: '📖 A world in six functions',
    agentTitle: 'Ask world-smith',
    agentText: 'A Kiro agent that writes the world with you and runs the checks.',
    command: 'kiro-cli chat --agent world-smith',
    closing: '🎃 Ghost Cloud was made this way.',
  },
  footer: {
    items: ['specs', 'hooks', 'steering', 'MCP', 'power', 'custom agent', 'property tests'],
    linkText: 'Third-party notices',
    linkHref: './THIRD_PARTY_NOTICES.txt',
  },
} as const;

/** N of the sticker, from the world-size data (rounded to hundreds, as today). */
const N = String(Math.round(worldSize.worlds['ghost-cloud'] / 100) * 100);

// ---- The check ------------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`copy deck: ${message}`);
}

function same(actual: unknown, expected: unknown, what: string): void {
  if (actual !== expected && JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const text = (el: Element | null | undefined, what: string): string => {
  if (!el) return fail(`${what}: element missing`);
  return el.textContent;
};

const page = (root: Element, id: PageId): HTMLElement => {
  const el = root.querySelector<HTMLElement>(`#pages [data-page="${id}"]`);
  if (!el) return fail(`page ${id} missing`);
  return el;
};

/** A link by its accessible name; `hidden` because the pages that are not current are inert. */
function link(scope: HTMLElement, name: string, href: string): void {
  let found: HTMLElement;
  try {
    found = within(scope).getByRole('link', { name, hidden: true });
  } catch {
    return fail(`link "${name}" missing`);
  }
  same(found.getAttribute('href'), href, `href of "${name}"`);
}

/** Checks the whole rendered landing page against the literal deck. */
function assertDeck(root: Element): void {
  const c = EXPECTED.cover;
  const cover = page(root, 'cover');
  same(text(cover.querySelector('.kicker'), 'kicker'), c.kicker, 'cover kicker');
  const h1 = cover.querySelector('h1');
  same(text(h1, 'h1'), c.heading, 'cover heading');
  same(text(h1?.querySelector('em'), 'em'), c.em, 'cover emphasised word');
  const p = cover.querySelector('.hero p');
  same(text(p, 'cover text'), c.before + c.bold, 'cover text');
  same(text(p?.querySelector('b'), 'bold'), c.bold, 'cover bold sentence');
  link(cover, c.primary.name, c.primary.href);
  link(cover, c.secondary.name, c.secondary.href);

  const r = EXPECTED.recipe;
  const recipe = page(root, 'recipe');
  same(text(recipe.querySelector('h2'), 'h2'), r.heading, 'recipe heading');
  same(text(recipe.querySelector('.sec-sub'), 'sub'), r.sub, 'recipe sub-heading');
  const world = recipe.querySelector('.ing-world');
  same(text(world?.querySelector('h3'), 'world title'), r.worldTitle, 'world title');
  same(text(world?.querySelector('.sub'), 'world sub'), r.worldSub, 'world sub-line');
  const rows = [...(world?.querySelectorAll('.fnl li') ?? [])].map((li) => [
    li.querySelector('code')?.textContent,
    li.textContent.slice(li.querySelector('code')?.textContent.length ?? 0),
  ]);
  same(rows, r.functions, 'six function rows');
  same(text(world?.querySelector('.lean'), 'sticker'), `That's all. Ghost Cloud is about ${N} lines.`, 'sticker');
  const skel = recipe.querySelector('.ing-skel');
  same(text(skel?.querySelector('h3'), 'skeleton title'), r.skeletonTitle, 'skeleton title');
  same(text(skel?.querySelector('.sub'), 'skeleton sub'), r.skeletonSub, 'skeleton sub-line');
  const parts = [...(skel?.querySelectorAll('.part') ?? [])].map((d) => [
    d.querySelector('b')?.textContent,
    d.querySelector('span')?.textContent,
  ]);
  same(parts, r.parts, 'eight parts (no folder line)');
  const built = [...(skel?.querySelectorAll('.built > *') ?? [])];
  same(built.length, 1, 'bottom row holds one element');
  same(built[0]?.textContent, r.chip, 'chip text');
  same(built[0]?.getAttribute('title'), r.chipTitle, 'chip title');
  const result = recipe.querySelector('.result');
  same(text(result?.querySelector('h3'), 'result title'), r.resultTitle, 'result title');
  same(text(result?.querySelector('p'), 'result text'), r.resultText, 'result text');

  const k = EXPECTED.costumes;
  const costumes = page(root, 'costumes');
  same(text(costumes.querySelector('h2'), 'h2'), k.heading, 'costumes heading');
  same(text(costumes.querySelector('.sec-sub'), 'sub'), k.sub, 'costumes sub-heading');
  const cards = [...costumes.querySelectorAll('article.cc')];
  same(cards.length, 3, 'three cards');
  cards.forEach((card, i) => {
    const [name, tag, world1, kiro, button, href] = k.cards[i] ?? [];
    same(card.querySelector('h3')?.textContent, name, `card ${String(i)} name`);
    same(card.querySelector('.cos')?.textContent, tag, `card ${String(i)} tag`);
    same(card.querySelector('.wl')?.textContent, world1, `card ${String(i)} world line`);
    same(card.querySelector('.kiro')?.textContent, kiro, `card ${String(i)} Kiro line`);
    link(card as HTMLElement, button ?? '', href ?? '');
    // Field order: name, tag, world line, chips, Kiro line, button.
    const order = ['h3', '.cos', '.wl', '.used', '.kiro', 'a.btn'].map((s) => {
      const el = card.querySelector(s);
      return el ? [...(el.parentElement?.children ?? [])].indexOf(el) : -1;
    });
    same(order, [...order].sort((a, b) => a - b), `card ${String(i)} field order`);
  });
  same(text(costumes.querySelector('.cards-note'), 'legend'), k.legend, 'legend');
  same(costumes.querySelector('.cards-note')?.previousElementSibling?.className, 'cards', 'legend sits under the cards');

  const u = EXPECTED.run;
  const run = page(root, 'run');
  same(text(run.querySelector('h2'), 'h2'), u.heading, 'Live_Section heading');
  same(text(run.querySelector('.sec-sub'), 'sub'), u.sub, 'Live_Section sub-heading');

  const m = EXPECTED.make;
  const make = page(root, 'make');
  same(text(make.querySelector('h2'), 'h2'), m.heading, 'make heading');
  same(text(make.querySelector('.sec-sub'), 'sub'), m.sub, 'make sub-heading');
  same(text(make.querySelector('.book-t'), 'spellbook'), m.spellbook, 'spellbook title');
  same(text(make.querySelector('.agent h3'), 'agent title'), m.agentTitle, 'agent title');
  same(text(make.querySelector('.agent p'), 'agent text'), m.agentText, 'agent text');
  same(text(make.querySelector('code.cmd'), 'command'), m.command, 'command');
  same(text(make.querySelector('.proof'), 'closing'), m.closing, 'closing line');

  const f = EXPECTED.footer;
  const foot = make.querySelector('footer.foot');
  same(
    [...(foot?.querySelectorAll('span') ?? [])].map((s) => s.textContent),
    f.items,
    'footer items',
  );
  same(foot?.textContent, `Built with Kiro: ${f.items.join('')}${f.linkText}`, 'footer text');
  link(foot as HTMLElement, f.linkText, f.linkHref);
}

function renderState(current: PageId, xray: boolean) {
  window.history.replaceState(null, '', `#${current}`);
  const view = render(<App />);
  same(page(view.container, current).classList.contains('on'), true, `${current} is the current page`);
  if (xray) {
    const sw = view.container.querySelector<HTMLInputElement>('#xray');
    if (!sw) fail('X-ray switch missing');
    else if (!sw.checked) fireEvent.click(sw);
    same(view.container.querySelector('#costumes')?.classList.contains('xray'), true, 'X-ray is on');
  }
  return view;
}

// ---- The tests ------------------------------------------------------------------------------

describe('Pg3: the copy deck is pinned (landing part)', () => {
  for (const current of PAGE_IDS) {
    for (const xray of [false, true]) {
      it(`shows the deck with ${current} current and X-ray ${xray ? 'on' : 'off'}`, () => {
        const { container } = renderState(current, xray);
        assertDeck(container);
      });
    }
  }

  it('has the data modules equal to the literal deck', () => {
    expect(COVER.kicker).toBe(EXPECTED.cover.kicker);
    expect(COVER.headingBefore + COVER.headingEm + COVER.headingAfter).toBe(EXPECTED.cover.heading);
    expect(COVER.textBefore + COVER.textBold).toBe(EXPECTED.cover.before + EXPECTED.cover.bold);
    expect(COVER.primaryButton).toEqual({ text: 'Meet the skeleton', href: '#recipe' });
    expect(COVER.secondaryButton).toEqual({ text: 'Watch the ghost work', href: '#run' });
    expect(RECIPE_HEADS.heading).toBe(EXPECTED.recipe.heading);
    expect(RECIPE_HEADS.sub).toBe(EXPECTED.recipe.sub);
    expect(RECIPE_HEADS.sticker.replace('{lines}', N)).toBe(`That's all. Ghost Cloud is about ${N} lines.`);
    expect(RECIPE_HEADS.chipText).toBe(EXPECTED.recipe.chip);
    expect(SPEC_NAMES.join(', ')).toBe(EXPECTED.recipe.chipTitle);
    expect(`Built from ${String(SPEC_NAMES.length)} of our 14 Kiro specs`).toBe(EXPECTED.recipe.chip);
    expect(WORLD_FUNCTIONS.map((f) => [f.name, f.line])).toEqual(EXPECTED.recipe.functions);
    expect(SKELETON_PARTS.map((p) => [p.name, p.line])).toEqual(EXPECTED.recipe.parts);
    expect(RECIPE_HEADS.resultTitle).toBe(EXPECTED.recipe.resultTitle);
    expect(RECIPE_HEADS.resultText).toBe(EXPECTED.recipe.resultText);
    expect(COSTUMES_HEADS.heading).toBe(EXPECTED.costumes.heading);
    expect(COSTUMES_HEADS.sub).toBe(EXPECTED.costumes.sub);
    expect(COSTUMES_HEADS.legend).toBe(EXPECTED.costumes.legend);
    expect(
      COSTUME_CARDS.map((c) => [
        c.name,
        c.costume,
        c.world,
        `${c.provenance.prefix} ${c.provenance.code}`,
        c.link.text,
        c.link.href,
      ]),
    ).toEqual(EXPECTED.costumes.cards);
    expect(RUN_HEADS.heading).toBe(EXPECTED.run.heading);
    expect(RUN_HEADS.sub).toBe(EXPECTED.run.sub);
    expect(MAKE_HEADS).toMatchObject({
      heading: EXPECTED.make.heading,
      sub: EXPECTED.make.sub,
      spellbookTitle: EXPECTED.make.spellbook,
      agentTitle: EXPECTED.make.agentTitle,
      agentText: EXPECTED.make.agentText,
      command: EXPECTED.make.command,
      closing: EXPECTED.make.closing,
    });
    expect(roundLines(worldSize.worlds['ghost-cloud'])).toBe(Number(N));
  });

  it('fails when one data-module string alone is changed', () => {
    const mutable = RECIPE_HEADS as { -readonly [K in keyof typeof RECIPE_HEADS]: string };
    const original = mutable.resultText;
    mutable.resultText = 'Copy → try → judge → flame.';
    try {
      const { container } = renderState('cover', false);
      expect(() => {
        assertDeck(container);
      }).toThrow(/result text/);
    } finally {
      mutable.resultText = original;
    }
  });

  it('fails when a skeleton part gains a folder line', () => {
    const parts = SKELETON_PARTS as { name: string; line: string }[];
    const first = parts[0];
    if (!first) throw new Error('no parts');
    const original = first.line;
    first.line = `${original} core/`;
    try {
      const { container } = renderState('recipe', false);
      expect(() => {
        assertDeck(container);
      }).toThrow(/eight parts/);
    } finally {
      first.line = original;
    }
  });
});
