import { describe, expect, it } from 'vitest';
import { FlameArt } from '../../src/components/art/FlameArt';
import { Icon } from '../../src/components/art/Icon';
import { SmokeLayer } from '../../src/components/art/SmokeLayer';
import { ThreadConnector } from '../../src/components/art/ThreadConnector';
import { TombstoneShape } from '../../src/components/art/TombstoneShape';
import { ICON_IDS, type IconId } from '../../src/model/icons';
import { renderMarkup } from '../support/markup';

const BODY = '<path d="M9 13h6v8H9zM7 21h10"></path><path d="M12 13v-1.5"></path>';
const FLAME = '<path d="M12 3.2c2.2 2.4 3 4 3 5.4a3 3 0 0 1-6 0c0-1.4.8-3 3-5.4z"></path>';
const RING = '<circle cx="12" cy="12" r="8"></circle>';

// The icon table of the design, written out independently of the component.
const TABLE: Record<IconId, string> = {
  'candle-lit': BODY + FLAME,
  'candle-flicker': BODY + FLAME + '<path d="M5.5 6l2 1.2M18.5 6l-2 1.2M4.5 10h2M17.5 10h2"></path>',
  'candle-out': BODY + '<path d="M12 11.5c-2-1.2-2-2.6 0-3.8s2-2.6 0-3.8"></path>',
  'candle-unknown': BODY + '<circle cx="12" cy="7.5" r="3.2" stroke-dasharray="2 1.6"></circle>',
  'candle-idle': BODY + '<path d="M10 8h4"></path>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  ban: RING + '<path d="M6.4 6.4l11.2 11.2"></path>',
  'not-applicable': RING + '<path d="M8 12h8"></path>',
  cloud: '<path d="M7 18a4 4 0 0 1-.6-7.96 5 5 0 0 1 9.6-1.54A4.8 4.8 0 0 1 17 18H7z"></path>',
  lamp: '<path d="M5 6h14v5H5z"></path><path d="M8 11v3M12 11v5M16 11v3"></path>',
  bulb: '<path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.1 1 1.9v.2h5v-.2c0-.8.4-1.4 1-1.9A6 6 0 0 0 12 3zM10 18h4M10 21h4"></path>',
  thread:
    '<path d="M4 18c4 0 4-12 8-12s4 12 8 12"></path><circle cx="4" cy="18" r="1.5"></circle><circle cx="20" cy="18" r="1.5"></circle>',
  'hidden-text': '<path d="M4 8h10M4 12h16"></path><path d="M4 16h12" stroke-dasharray="2 2"></path>',
  warning: '<path d="M12 4l9 16H3zM12 10v4M12 17h.01"></path>',
  'link-changed': '<path d="M9 8h-2a4 4 0 0 0 0 8h2M15 8h2a4 4 0 0 1 0 8h-2M9 12h6"></path>',
  'state-created': '<circle cx="12" cy="12" r="7"></circle>',
  'state-overwritten': '<path d="M5 9h14M5 15h14"></path>',
  'state-present': '<circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2"></circle>',
  'state-absent': '<circle cx="12" cy="12" r="7" stroke-dasharray="2 2"></circle>',
  chevron: '<path d="M6 9l6 6 6-6"></path>',
  back: '<path d="M15 5l-7 7 7 7"></path>',
};

function inner(markup: string): string {
  const m = /^<svg[^>]*>([\s\S]*)<\/svg>$/.exec(markup);
  return m?.[1] ?? '';
}

const CANDLES = ['candle-lit', 'candle-flicker', 'candle-out', 'candle-unknown', 'candle-idle'] as const;

function allArt(): Record<string, string> {
  const art: Record<string, string> = {
    smoke: renderMarkup(<SmokeLayer />),
    tombstone: renderMarkup(<TombstoneShape />),
    thread: renderMarkup(<ThreadConnector />),
    'flame-lit': renderMarkup(<FlameArt state="lit" />),
    'flame-flickering': renderMarkup(<FlameArt state="flickering" />),
    'flame-out': renderMarkup(<FlameArt state="out" />),
  };
  for (const id of ICON_IDS) art[`icon-${id}`] = renderMarkup(<Icon id={id} />);
  return art;
}

describe('SVG art (static)', () => {
  it('the table covers exactly ICON_IDS', () => {
    expect(Object.keys(TABLE).sort()).toEqual([...ICON_IDS].sort());
  });

  it.each(ICON_IDS)('icon %s equals the design table', (id) => {
    const html = renderMarkup(<Icon id={id} />);
    expect(inner(html)).toBe(TABLE[id]);
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('fill="none"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('stroke-linecap="round"');
    expect(html).toContain('stroke-linejoin="round"');
  });

  it('the five candle icons are pairwise different in shape', () => {
    for (let i = 0; i < CANDLES.length; i++) {
      for (let j = i + 1; j < CANDLES.length; j++) {
        expect(TABLE[CANDLES[i] as IconId]).not.toBe(TABLE[CANDLES[j] as IconId]);
        expect(inner(renderMarkup(<Icon id={CANDLES[i] as IconId} />))).not.toBe(inner(renderMarkup(<Icon id={CANDLES[j] as IconId} />)));
      }
    }
  });

  it('ban, not-applicable, and the other icons are pairwise different', () => {
    const shapes = ICON_IDS.map((id) => inner(renderMarkup(<Icon id={id} />)));
    expect(new Set(shapes).size).toBe(ICON_IDS.length);
  });

  it('the flame shapes differ without motion', () => {
    const lit = renderMarkup(<FlameArt state="lit" />);
    const flick = renderMarkup(<FlameArt state="flickering" />);
    const out = renderMarkup(<FlameArt state="out" />);
    expect(new Set([lit, flick, out]).size).toBe(3);
    expect(flick).toContain('M10 14l5 3M38 14l-5 3');
    expect(lit).not.toContain('M10 14l5 3');
    expect(out).toContain('M24 30c-5-3-5-7 0-10s5-7 0-10');
    expect(out).not.toContain('gk-flame');
  });

  it('draws the design geometry for smoke, tombstone, and thread', () => {
    expect(renderMarkup(<SmokeLayer />)).toContain('viewBox="0 0 40 24"');
    expect(renderMarkup(<SmokeLayer />).match(/<circle/g)).toHaveLength(3);
    expect(renderMarkup(<ThreadConnector />)).toContain('d="M2 12C40 2 80 22 118 12"');
    const tomb = renderMarkup(<TombstoneShape />);
    expect(tomb).toContain('d="M6 50V20a14 14 0 0 1 28 0v30z"');
    expect(tomb).toContain('d="M3 50h34"');
    expect(tomb).toContain('d="M13 26h14M13 32h14M13 38h8"');
  });

  it('the tombstone has no crossing strokes', () => {
    type Seg = readonly [number, number, number, number];
    const segs: Seg[][] = [];
    for (const m of renderMarkup(<TombstoneShape />).matchAll(/ d="([^"]+)"/g)) {
      const own: Seg[] = [];
      let x = 0;
      let y = 0;
      let sx = 0;
      let sy = 0;
      for (const c of (m[1] ?? '').matchAll(/([MmHhVvAaZz])([^A-Za-z]*)/g)) {
        const cmd = c[1] as string;
        const n = (c[2] ?? '').split(/[\s,]+/).filter((s) => s !== '').map(Number);
        const line = (nx: number, ny: number): void => {
          own.push([x, y, nx, ny]);
          x = nx;
          y = ny;
        };
        if (cmd === 'M' || cmd === 'm') {
          for (let i = 0; i + 1 < n.length; i += 2) {
            const nx = cmd === 'M' ? (n[i] as number) : x + (n[i] as number);
            const ny = cmd === 'M' ? (n[i + 1] as number) : y + (n[i + 1] as number);
            if (i === 0) {
              x = nx;
              y = ny;
              sx = nx;
              sy = ny;
            } else line(nx, ny);
          }
        } else if (cmd === 'H') n.forEach((v) => line(v, y));
        else if (cmd === 'h') n.forEach((v) => line(x + v, y));
        else if (cmd === 'V') n.forEach((v) => line(x, v));
        else if (cmd === 'v') n.forEach((v) => line(x, y + v));
        else if (cmd === 'a') {
          // Arc: only its end point matters; the curve itself is treated as a chord (no segment).
          x += n[5] as number;
          y += n[6] as number;
        } else if (cmd === 'z' || cmd === 'Z') line(sx, sy);
      }
      segs.push(own);
    }
    const all = segs.flat();
    expect(all.length).toBeGreaterThan(5);
    // Proper crossing: the intersection lies strictly inside both segments.
    const crosses = (a: Seg, b: Seg): boolean => {
      const d = (a[2] - a[0]) * (b[3] - b[1]) - (a[3] - a[1]) * (b[2] - b[0]);
      if (d === 0) return false;
      const t = ((b[0] - a[0]) * (b[3] - b[1]) - (b[1] - a[1]) * (b[2] - b[0])) / d;
      const u = ((b[0] - a[0]) * (a[3] - a[1]) - (b[1] - a[1]) * (a[2] - a[0])) / d;
      return t > 0 && t < 1 && u > 0 && u < 1;
    };
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) expect(crosses(all[i] as Seg, all[j] as Seg)).toBe(false);
    }
    // The detector itself sees a cross.
    expect(crosses([0, 5, 10, 5], [5, 0, 5, 10])).toBe(true);
  });

  it('every decorative SVG is aria-hidden and not focusable', () => {
    for (const [name, html] of Object.entries(allArt())) {
      expect(html.startsWith('<svg'), name).toBe(true);
      expect(html, name).toContain('aria-hidden="true"');
      expect(html, name).toContain('focusable="false"');
    }
  });

  it('has no style attribute, no literal color, no title, and no link', () => {
    for (const [name, html] of Object.entries(allArt())) {
      expect(html, name).not.toMatch(/\sstyle=/);
      expect(html, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(html, name).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
      expect(html, name).not.toMatch(/<title|href=|src=|\son[a-z]+=/);
      for (const m of html.matchAll(/\s(?:fill|stroke)="([^"]*)"/g)) {
        expect(['none', 'currentColor'], name).toContain(m[1]);
      }
    }
  });

  it('sets data-motion only when reduced motion is on (server snapshot is off)', () => {
    expect(renderMarkup(<FlameArt state="lit" />)).not.toContain('data-motion');
    expect(renderMarkup(<SmokeLayer />)).not.toContain('data-motion');
  });
});
