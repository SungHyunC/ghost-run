// **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5, 14.12**
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ShowcaseApp } from '../../src/showcase/ShowcaseApp';
import { CANDLE_STATES } from '../../src/showcase/sample-data';

afterEach(cleanup);

const CSS = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'showcase', 'styles', 'showcase.css'), 'utf8');

interface Rule {
  selector: string;
  body: string;
}
/** Flat list of rules, with the rules inside an at-rule block flattened and tagged by `media`. */
const parseRules = (css: string): { rules: Rule[]; media: Rule[] } => {
  const rules: Rule[] = [];
  const media: Rule[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /(@media[^{]+)\{((?:[^{}]*\{[^{}]*\})*)\s*\}|([^{}@]+)\{([^{}]*)\}/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m[1] !== undefined) {
      const inner = /([^{}]+)\{([^{}]*)\}/g;
      for (let n = inner.exec(m[2] ?? ''); n !== null; n = inner.exec(m[2] ?? '')) {
        media.push({ selector: `${m[1].trim()} ${(n[1] ?? '').trim()}`, body: n[2] ?? '' });
      }
    } else rules.push({ selector: (m[3] ?? '').trim(), body: m[4] ?? '' });
  }
  return { rules, media };
};
const { rules, media } = parseRules(CSS);
const px = (body: string, prop: string): number | null => {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(body);
  return m === null ? null : Number(m[1]);
};
const find = (sel: string): Rule[] => rules.filter((r) => r.selector.split(',').map((s) => s.trim()).includes(sel));

const row = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(id);
  return el;
};

describe('Showcase tabs', () => {
  it('has the tab roles and a roving tabindex', () => {
    render(<ShowcaseApp />);
    const list = within(row('p-candle')).getByRole('tablist');
    expect(list.getAttribute('aria-label')).toBeTruthy();
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(CANDLE_STATES.length);
    expect(tabs.map((t) => t.tabIndex)).toEqual(tabs.map((_, i) => (i === 0 ? 0 : -1)));
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('aria-controls names the panel, and the panel is labelled by the selected tab', () => {
    render(<ShowcaseApp />);
    const tabs = within(row('p-candle')).getAllByRole('tab');
    const panel = within(row('p-candle')).getByRole('tabpanel');
    for (const t of tabs) expect(t.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0]?.id);
    fireEvent.click(tabs[2] as HTMLElement);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[2]?.id);
  });

  it('moves with the arrow keys, Home, and End, and selects with Enter and Space', async () => {
    const user = userEvent.setup();
    render(<ShowcaseApp />);
    const tabs = within(row('p-candle')).getAllByRole('tab');
    const last = tabs.length - 1;
    const selected = (): number => tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    tabs[0]?.focus();
    await user.keyboard('{ArrowRight}');
    expect(selected()).toBe(1);
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]?.tabIndex).toBe(0);
    expect(tabs[0]?.tabIndex).toBe(-1);
    await user.keyboard('{End}');
    expect(selected()).toBe(last);
    await user.keyboard('{ArrowRight}');
    expect(selected()).toBe(0);
    await user.keyboard('{ArrowLeft}');
    expect(selected()).toBe(last);
    await user.keyboard('{Home}');
    expect(selected()).toBe(0);
    await user.keyboard('{ArrowDown}');
    expect(selected()).toBe(1);
    await user.keyboard('{ArrowUp}');
    expect(selected()).toBe(0);
    await user.keyboard('{Enter}');
    expect(selected()).toBe(0);
    await user.keyboard('{ArrowRight}{ArrowRight}');
    await user.keyboard(' ');
    expect(selected()).toBe(2);
    expect(document.activeElement).toBe(tabs[2]);
  });
});

describe('Showcase reachability and decoration', () => {
  it('reaches every interactive Showcase element with the Tab key', async () => {
    const user = userEvent.setup();
    const { container } = render(<ShowcaseApp />);
    const sel = 'a[href], button, input, textarea, select, [tabindex]';
    const expected = [...container.querySelectorAll<HTMLElement>(sel)].filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0 && !el.closest('[hidden]') && !el.closest('[inert]'),
    );
    expect(expected.length).toBeGreaterThan(20);
    const reached = new Set<Element>();
    const total = container.querySelectorAll(sel).length;
    for (let i = 0; i < total + 5; i++) {
      await user.tab();
      if (document.activeElement !== null) reached.add(document.activeElement);
    }
    for (const el of expected) expect(reached.has(el), `${el.tagName}.${el.getAttribute('class') ?? ''}#${el.id}`).toBe(true);
    // Every tab that is not selected is left out of the Tab order (roving tabindex).
    const tabs = within(row('p-candle')).getAllByRole('tab');
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
  });

  it('marks every decorative svg of the Showcase page hidden', () => {
    const { container } = render(<ShowcaseApp />);
    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs.length).toBeGreaterThan(5);
    for (const s of svgs) {
      // The kit's own svgs are the kit's business; the Showcase's own art sits outside `.frame-body`.
      if (s.closest('.frame-body') !== null) continue;
      expect(s.closest('[aria-hidden="true"]'), s.getAttribute('class') ?? 'svg').not.toBeNull();
    }
    for (const s of container.querySelectorAll('.kcard svg, .khero-art svg')) {
      expect(s.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});

describe('showcase.css', () => {
  it('declares 24 px minimums for the cards, tabs, and links', () => {
    const card = find('.kcard')[0];
    expect(px(card?.body ?? '', 'min-height')).toBeGreaterThanOrEqual(24);
    const tab = find('.ktab')[0];
    expect(px(tab?.body ?? '', 'min-height')).toBeGreaterThanOrEqual(24);
    expect(px(tab?.body ?? '', 'min-width')).toBeGreaterThanOrEqual(24);
    const link = find('.foot a')[0];
    expect(px(link?.body ?? '', 'min-height')).toBeGreaterThanOrEqual(24);
  });

  it('declares a visible focus ring for the cards, tabs, and links', () => {
    for (const sel of ['.kcard:focus-visible', '.ktab:focus-visible', '.foot a:focus-visible']) {
      const r = rules.find((x) => x.selector.split(',').map((s) => s.trim()).includes(sel));
      expect(r, sel).toBeDefined();
      expect(r?.body, sel).toMatch(/outline:\s*[2-9]px solid/u);
      expect(r?.body, sel).not.toMatch(/outline:\s*(?:none|0)/u);
    }
  });

  it('has a reduced-motion block that names the ghost bob and the orbit', () => {
    const rm = media.filter((r) => r.selector.startsWith('@media (prefers-reduced-motion'));
    expect(rm.length).toBeGreaterThan(0);
    const names = rm.map((r) => r.selector).join(' ');
    expect(names).toContain('.kh-boo');
    expect(names).toContain('.kh-orbit');
    const anim = rm.find((r) => r.selector.includes('.kh-boo'));
    expect(anim?.body).toMatch(/animation:\s*none/u);
  });

  it('overrides no gk-* rule and no kit token', () => {
    expect(CSS).not.toMatch(/gk-/u);
    expect(CSS).not.toMatch(/--gk/u);
    const all = [...rules, ...media];
    for (const r of all) {
      expect(r.selector).not.toMatch(/\.gk-|\.gk\b/u);
      expect(r.body).not.toMatch(/--gk/u);
    }
    // Rules that reach into a frame touch only `.frame-body` layout properties.
    for (const r of all.filter((x) => x.selector.includes('.frame-body'))) {
      const props = r.body.split(';').map((d) => d.split(':')[0]?.trim() ?? '').filter((p) => p !== '');
      for (const p of props) expect(['min-height', 'padding', 'overflow'], `${r.selector} ${p}`).toContain(p);
    }
  });
});
