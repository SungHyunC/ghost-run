import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stylesDir = join(siteRoot, 'src', 'styles');
const css = readdirSync(stylesDir)
  .filter((f) => f.endsWith('.css'))
  .sort()
  .map((f) => readFileSync(join(stylesDir, f), 'utf8'))
  .join('\n');

// ---- stylesheet lookup ------------------------------------------------------

type Decl = { prop: string; value: string };

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** All declarations of every rule whose selector is exactly `sel`. */
function declsOf(sel: string): Decl[] {
  const re = new RegExp(`(?:^|[}{]|\\*/)\\s*${escapeRe(sel)}\\s*\\{([^}]*)\\}`, 'g');
  const out: Decl[] = [];
  for (const m of css.matchAll(re)) {
    for (const part of (m[1] ?? '').split(';')) {
      const i = part.indexOf(':');
      if (i > 0) out.push({ prop: part.slice(0, i).trim(), value: part.slice(i + 1).trim() });
    }
  }
  return out;
}

const hasDecl = (sel: string, prop: string, token: string): boolean =>
  declsOf(sel).some((d) => (d.prop === prop || d.prop.startsWith(`${prop}-`)) && d.value.includes(token));

const vars = new Map<string, string>();
for (const d of declsOf('.site')) {
  if (d.prop.startsWith('--')) vars.set(d.prop, d.value);
}
// `--card` and `--line` hold rgba values that contain commas, so re-read them whole.
for (const m of css.matchAll(/(--[a-z0-9]+):([^;]+);/g)) {
  if (m[1] !== undefined && m[2] !== undefined && !vars.has(m[1])) vars.set(m[1], m[2].trim());
}

// ---- color math -------------------------------------------------------------

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(input: string): Rgba {
  let s = input.trim();
  const v = /^var\((--[a-z0-9]+)\)$/.exec(s);
  if (v?.[1] !== undefined) {
    const resolved = vars.get(v[1]);
    if (resolved === undefined) throw new Error(`unknown variable ${s}`);
    s = resolved;
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex?.[1] !== undefined) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (rgba !== null) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: rgba[4] === undefined ? 1 : Number(rgba[4]) };
  }
  throw new Error(`cannot parse color ${input}`);
}

const over = (top: Rgba, under: Rgba): Rgba => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});

const lin = (c: number): number => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: Rgba): number => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const ratio = (a: Rgba, b: Rgba): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** The page background that every translucent layer is composited over first. */
const BASE = '#1c0e3b';

function composite(layers: readonly string[], root: string = BASE): Rgba {
  return layers.reduce<Rgba>((acc, l) => over(parseColor(l), acc), parseColor(root));
}

// ---- curated pairs ----------------------------------------------------------

type Bg = {
  /** Background layers, bottom first, composited over `root`. */
  layers: readonly string[];
  /** Opaque color under the layers. Defaults to the page background. */
  root?: string;
};
type Pair = {
  sel: string;
  /** Selector that declares `color` when it differs from `sel` (inherited text). */
  colorSel?: string;
  /** Text color token as written in the rule. */
  fg: string;
  bg: Bg;
  /** Element opacity that blends the text into the background. */
  opacity?: number;
  /** Large text (24 px, or 18.66 px bold) needs only 3:1. */
  large?: boolean;
};

const page: Bg = { layers: [] };
const glass = (...layers: string[]): Bg => ({ layers });
const theater = (...layers: string[]): Bg => ({ layers, root: '#160b2e' });
const realPane = (...layers: string[]): Bg => ({ layers, root: '#efe2c4' });
const orange = 'rgba(255,138,61,.20)';
const bone13 = 'rgba(247,240,225,.13)';
const card = 'rgba(255,255,255,.065)';
const witch = 'rgba(180,140,255,.12)';
const mint08 = 'rgba(174,245,223,.08)';

const TEXT: Pair[] = [
  { sel: '.site', fg: 'var(--text)', bg: page },
  { sel: '.logo span', fg: 'var(--pump)', bg: page },
  { sel: '.nav-links a', fg: 'var(--dim)', bg: glass('rgba(255,255,255,.05)') },
  { sel: '.nav-links a.on', fg: 'var(--ink)', bg: glass('#f7f0e1') },
  { sel: '.hero h1', colorSel: '.site', fg: 'var(--text)', bg: page, large: true },
  { sel: '.hero h1 em', fg: 'var(--mint)', bg: page, large: true },
  { sel: '.hero p', fg: 'var(--dim)', bg: page },
  { sel: '.hero p b', fg: 'var(--bone)', bg: page },
  { sel: '.kicker', fg: 'var(--ink)', bg: glass('#ffb057') },
  { sel: '.nbadge', fg: '#2a1406', bg: glass('#ff8a3d') },
  { sel: '.btn', fg: 'var(--text)', bg: glass('rgba(255,255,255,.08)') },
  { sel: '.btn-main', fg: '#08372a', bg: glass('#aef5df') },
  { sel: '.sec-head h2', colorSel: '.site', fg: 'var(--text)', bg: page, large: true },
  { sel: '.sec-sub', fg: 'var(--dim)', bg: page },
  { sel: '.op', fg: 'var(--pump2)', bg: page, large: true },
  { sel: '.ing .sub', fg: 'var(--dim)', bg: glass(orange) },
  { sel: '.fnl li', fg: '#ffe3cf', bg: glass(orange, 'rgba(0,0,0,.18)') },
  { sel: '.fnl code', fg: '#2a1406', bg: glass('#ffb057') },
  { sel: '.lean', fg: '#ffe6a8', bg: glass(orange, 'rgba(255,211,107,.12)') },
  { sel: '.part span', fg: 'var(--dim)', bg: glass(bone13, 'rgba(0,0,0,.2)') },
  { sel: '.part i', fg: 'var(--bone)', opacity: 0.8, bg: glass(bone13, 'rgba(0,0,0,.2)') },
  { sel: '.built', fg: 'var(--dim)', bg: glass(bone13) },
  { sel: '.built code', fg: 'var(--bone)', bg: glass(bone13, 'rgba(255,255,255,.07)') },
  { sel: '.result h3', fg: 'var(--mint)', bg: glass('rgba(174,245,223,.07)') },
  { sel: '.result p', fg: 'var(--dim)', bg: glass('rgba(174,245,223,.07)') },
  { sel: '.xsw', fg: 'var(--bone)', bg: page },
  { sel: '.try', fg: 'var(--ink)', bg: glass('#ffd36b') },
  { sel: '.cc-tag', colorSel: '.site', fg: 'var(--text)', bg: glass(card, 'rgba(255,255,255,.12)') },
  { sel: '.cc .cos', fg: 'var(--pump2)', bg: glass(card) },
  { sel: '.cc .wl small', fg: 'var(--dim)', bg: glass(card, 'rgba(255,138,61,.12)') },
  { sel: '.used-t', fg: 'var(--dim)', bg: glass(card) },
  { sel: '.used span', fg: 'var(--bone)', bg: glass(card, 'rgba(247,240,225,.14)') },
  { sel: '.cc .kiro', fg: 'var(--dim)', bg: glass(card) },
  { sel: '.cc .kiro code', fg: 'var(--slime)', bg: glass(card, 'rgba(155,229,100,.1)') },
  { sel: '.same', fg: '#07372a', bg: glass('#aef5df') },
  { sel: '.cards-note', fg: 'var(--dim)', bg: page },
  { sel: '.wchip', fg: 'var(--text)', bg: glass('rgba(255,255,255,.05)') },
  { sel: '.wchip[aria-pressed="true"]', colorSel: '.wchip', fg: 'var(--text)', bg: glass('rgba(255,138,61,.16)') },
  { sel: '.rail button', fg: 'var(--dim)', bg: glass('rgba(255,255,255,.04)') },
  { sel: '.rail .n', colorSel: '.rail button', fg: 'var(--dim)', bg: glass('rgba(255,255,255,.04)', 'rgba(255,255,255,.1)') },
  { sel: '.rail b', fg: 'var(--text)', bg: glass('rgba(255,255,255,.04)') },
  { sel: '.rail code', fg: 'var(--pump2)', bg: glass('rgba(255,255,255,.04)') },
  { sel: '.rail button.done .n', fg: '#173b07', bg: glass('#9be564') },
  { sel: '.rail button.now .n', fg: '#fff', bg: glass('#9046ff') },
  { sel: '.rail button.now', colorSel: '.rail button', fg: 'var(--dim)', bg: glass('rgba(144,70,255,.22)') },
  { sel: '.plan', fg: 'var(--dim)', bg: theater() },
  { sel: '.plan-h', fg: 'var(--bone)', bg: theater() },
  { sel: '.plan pre', fg: '#e9e2ff', bg: glass('#0c0618') },
  { sel: '.rev-tag', fg: '#173b07', bg: glass('#9be564') },
  { sel: '.real', fg: '#3b2b10', bg: glass('#efe2c4') },
  { sel: '.copy', fg: '#e9fff8', bg: theater(mint08) },
  { sel: '.seal', fg: 'var(--mint)', bg: theater(mint08, 'rgba(174,245,223,.18)') },
  { sel: '.fpb', fg: '#fff', bg: glass('#2d873b') },
  { sel: '.gob', fg: '#fff', bg: glass('var(--kiro)') },
  { sel: '.dropped .tag', fg: '#fff', bg: glass('#c2525d') },
  { sel: '.soft .tag', fg: '#1d0f3a', bg: glass('var(--witch)') },
  { sel: '.new', fg: '#173b07', bg: glass('var(--slime)') },
  { sel: '.hl', fg: 'var(--mint)', bg: theater(mint08, 'rgba(0,0,0,.18)') },
  { sel: '.jl', fg: 'var(--flame)', bg: theater(mint08, 'rgba(0,0,0,.18)') },
  { sel: '.tile.ok .res', colorSel: '.tile.ok .res', fg: '#173b07', bg: glass('var(--slime)') },
  { sel: '.tile.fail .res', fg: '#fff', bg: glass('#c2525d') },
  { sel: '.real .bucket .objs span', fg: '#4a2c8a', bg: realPane('rgba(0,0,0,.08)', 'rgba(144,70,255,.14)') },
  { sel: '.wkind', fg: 'var(--dim)', bg: theater(witch) },
  { sel: '.chk', colorSel: '.copy', fg: '#e9fff8', bg: theater(witch, 'rgba(0,0,0,.2)') },
  { sel: '.chk.ok em', fg: 'var(--slime)', bg: theater(witch, 'rgba(0,0,0,.2)') },
  { sel: '.chk.bad em', fg: 'var(--red)', bg: theater('rgba(255,107,122,.12)', 'rgba(0,0,0,.2)') },
  { sel: '.eo', fg: 'var(--mint)', bg: theater(witch) },
  { sel: '.vnote', fg: 'var(--dim)', bg: theater('rgba(255,255,255,.05)') },
  { sel: '.stamp.block', fg: 'var(--red)', bg: theater('rgba(255,255,255,.05)') },
  { sel: '.stamp.pass', fg: 'var(--slime)', bg: theater('rgba(255,255,255,.05)') },
  { sel: '.term', fg: '#e9e2ff', bg: glass('#0c0618') },
  { sel: '.term .pr', fg: 'var(--slime)', bg: glass('#0c0618') },
  { sel: '.say', fg: 'var(--ink)', bg: glass('#f7f0e1') },
  { sel: '.say p code', fg: '#3b2b10', bg: glass('#efe4c9') },
  { sel: '.say p b', fg: '#6a2fd6', bg: glass('#f7f0e1') },
  { sel: '.book', fg: '#ffe9cc', bg: glass('#2b1a12') },
  { sel: '.book-t', fg: 'var(--pump2)', bg: glass('#2b1a12') },
  { sel: '.book .c', fg: '#c9a27a', bg: glass('#2b1a12') },
  { sel: '.book .k', fg: 'var(--pump2)', bg: glass('#2b1a12') },
  { sel: '.agent p', fg: 'var(--dim)', bg: glass(witch) },
  { sel: '.agent .cmd', fg: 'var(--mint)', bg: glass('#140b26') },
  { sel: '.agent .proof', fg: 'var(--bone)', bg: glass(witch) },
  { sel: '.foot', fg: 'var(--dim)', bg: page },
  { sel: '.foot span', fg: 'var(--slime)', bg: glass('rgba(155,229,100,.1)') },
];

type Border = {
  sel: string;
  prop: string;
  /** The border color token as written in the rule. */
  value: string;
};
const BORDERS: Border[] = [
  { sel: '.btn', prop: 'border', value: 'rgba(255,255,255,.34)' },
  { sel: '.wchip', prop: 'border', value: 'rgba(255,255,255,.34)' },
  { sel: '.rail button', prop: 'border', value: 'rgba(255,255,255,.34)' },
  { sel: '.xsw input', prop: 'border', value: 'rgba(255,255,255,.34)' },
  { sel: '.rail button.now', prop: 'border-color', value: 'var(--kiro)' },
  { sel: '.wchip[aria-pressed="true"]', prop: 'border-color', value: 'var(--pump)' },
];

const effective = (fg: Rgba, bg: Rgba, opacity = 1): Rgba => over({ ...fg, a: fg.a * opacity }, bg);

describe('contrast of text and borders (Requirement 15.7)', () => {
  it('has a curated table of pairs', () => {
    expect(TEXT.length).toBeGreaterThan(60);
    expect(BORDERS.length).toBeGreaterThan(0);
  });

  for (const p of TEXT) {
    const limit = p.large === true ? 3 : 4.5;
    it(`${p.sel}: ${p.fg} on ${[...p.bg.layers, p.bg.root ?? BASE].join(' / ')} is at least ${limit}`, () => {
      expect(hasDecl(p.colorSel ?? p.sel, 'color', p.fg), `color ${p.fg} in rule ${p.colorSel ?? p.sel}`).toBe(true);
      const bg = composite(p.bg.layers, p.bg.root);
      const fg = effective(parseColor(p.fg), bg, p.opacity);
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(limit);
    });
  }

  for (const b of BORDERS) {
    it(`${b.sel}: ${b.prop} ${b.value} against the page is at least 3`, () => {
      expect(hasDecl(b.sel, b.prop, b.value), `${b.prop} ${b.value} in rule ${b.sel}`).toBe(true);
      const page = parseColor(BASE);
      const border = over(parseColor(b.value), page);
      expect(ratio(border, page)).toBeGreaterThanOrEqual(3);
    });
  }

  it('contrast math matches known values', () => {
    expect(ratio(parseColor('#000'), parseColor('#fff'))).toBeCloseTo(21, 5);
    expect(ratio(parseColor('#777'), parseColor('#fff'))).toBeCloseTo(4.48, 2);
  });
});
