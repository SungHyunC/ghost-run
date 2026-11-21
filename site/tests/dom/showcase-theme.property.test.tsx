// **Feature: site-pages, Property Pg10: A frame's theme follows its own kit Lights switch and no other frame**
// **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6**
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShowcaseApp } from '../../src/showcase/ShowcaseApp';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ROOT = 'div.gk-root';
const SWITCH = ':scope > header button[role="switch"]';
const roots = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(ROOT)];
const theme = (el: Element): string | null => el.getAttribute('data-theme');
const lightsSwitch = (el: Element): HTMLElement => {
  const sw = el.querySelector<HTMLElement>(SWITCH);
  if (sw === null) throw new Error('no Lights switch');
  return sw;
};
const ser = (el: Element): string => new XMLSerializer().serializeToString(el);
const row = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(id);
  return el;
};

/** Puts component state into the frames: a Candle tab, the Blacklight switch, an open tombstone. */
function setUpState(): void {
  fireEvent.click(within(row('p-candle')).getAllByRole('tab')[2] as HTMLElement);
  fireEvent.click(row('p-blacklight').querySelector('section[data-blacklight] button[role="switch"]') as HTMLElement);
  fireEvent.click(row('p-grave').querySelector('button.gk-tombstone') as HTMLElement);
}

/** The state that the frames hold apart from the theme and the switch label. */
function state(): { tab: string[]; bl: string | null; grave: string } {
  return {
    tab: within(row('p-candle'))
      .getAllByRole('tab')
      .map((t) => t.getAttribute('aria-selected') ?? ''),
    bl: row('p-blacklight').querySelector('section[data-blacklight] button[role="switch"]')?.getAttribute('aria-checked') ?? null,
    grave: ser(row('p-grave')).replace(/ data-theme="[a-z]+"/, '').replace(/aria-checked="(true|false)"/, '').replace(/Lights: (on|off)/, ''),
  };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : [p];
  });
}

describe('Pg10: the frame theme', () => {
  it('every frame starts dark, except the light candle; the Mirror row has no theme control', () => {
    render(<ShowcaseApp />);
    const all = roots();
    expect(all.length).toBeGreaterThanOrEqual(7);
    const lights = [...row('p-lights').querySelectorAll(ROOT)];
    expect(lights.map(theme)).toEqual(['dark', 'light']);
    for (const r of all) if (!lights.includes(r)) expect(theme(r)).toBe('dark');
    expect(row('p-mirror').querySelector('[aria-pressed]')).toBeNull();
    expect(row('p-mirror').querySelectorAll('button[role="switch"]')).toHaveLength(1);
    expect(row('p-mirror').querySelector(`${ROOT} ${SWITCH.replace(':scope', '')}`)).not.toBeNull();
    expect(document.querySelector('[aria-pressed]')).toBeNull();
  });

  it('each frame follows only its own Lights switch; other frames keep theme and state', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 1, maxLength: 12 }), (picks) => {
        cleanup();
        vi.restoreAllMocks();
        render(<ShowcaseApp />);
        setUpState();
        const all = roots();
        const model = all.map(theme);
        const baseState = state();
        const written: Array<[Element, string]> = [];
        const orig = Element.prototype.setAttribute;
        vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, name: string, value: string) {
          if (name === 'data-theme') written.push([this, value]);
          orig.call(this, name, value);
        });
        const expectedWrites = new Map<Element, number>();
        for (const p of picks) {
          const i = p % all.length;
          const target = all[i] as HTMLElement;
          const beforeOthers = all.map((r, j) => (j === i ? '' : ser(r)));
          fireEvent.click(lightsSwitch(target));
          model[i] = model[i] === 'dark' ? 'light' : 'dark';
          expectedWrites.set(target, (expectedWrites.get(target) ?? 0) + 1);
          expect(all.map(theme)).toEqual(model);
          expect(lightsSwitch(target).getAttribute('aria-checked')).toBe(model[i] === 'light' ? 'true' : 'false');
          all.forEach((r, j) => {
            if (j !== i) expect(ser(r)).toBe(beforeOthers[j]);
          });
          expect(state()).toEqual(baseState);
        }
        // Only the clicked frames received a write, once per click, and each write is the model value (React's own).
        for (const [el] of written) expect(expectedWrites.has(el)).toBe(true);
        for (const [el, n] of expectedWrites) expect(written.filter(([e]) => e === el)).toHaveLength(n);
        // The page around the frames stays dark: no theme attribute outside the kit roots.
        for (const el of document.querySelectorAll('[data-theme]')) expect(el.matches(ROOT)).toBe(true);
        expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
        expect(document.body.hasAttribute('data-theme')).toBe(false);
        const site = document.querySelector('.site') as HTMLElement;
        expect(site.closest('.gk-root')).toBeNull();
        expect(site.hasAttribute('data-theme')).toBe(false);
      }),
      { numRuns: 25 },
    );
  });

  it('the source of the Showcase never writes data-theme', () => {
    const dir = join(__dirname, '../../src/showcase');
    const files = sourceFiles(dir).filter((f) => /\.(tsx?|jsx?|mjs|css)$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/data-theme|dataset\s*\.\s*theme|dataset\s*\[\s*['"]theme/);
      expect(text, f).not.toMatch(/setAttribute\s*\(\s*['"`]data-theme/);
      expect(text, f).not.toMatch(/initialTheme\s*=\s*\{\s*[a-z]/);
    }
  });
});
