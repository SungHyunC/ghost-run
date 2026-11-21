import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stylesDir = join(siteRoot, 'src', 'styles');
const landingCss = readdirSync(stylesDir)
  .filter((f) => f.endsWith('.css'))
  .sort()
  .map((f) => readFileSync(join(stylesDir, f), 'utf8'))
  .join('\n');
const showcaseCss = readFileSync(join(siteRoot, 'src', 'showcase', 'styles', 'showcase.css'), 'utf8');
const css = landingCss;

// ---- stylesheet lookup ------------------------------------------------------

type Decl = { prop: string; value: string };

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** All declarations of every rule whose selector is exactly `sel`. */
function declsOf(sel: string, source: string = css): Decl[] {
  const re = new RegExp(`(?:^|[}{]|\\*/)\\s*${escapeRe(sel)}\\s*\\{([^}]*)\\}`, 'g');
  const out: Decl[] = [];
  for (const m of source.matchAll(re)) {
    for (const part of (m[1] ?? '').split(';')) {
      const i = part.indexOf(':');
      if (i > 0) out.push({ prop: part.slice(0, i).trim(), value: part.slice(i + 1).trim() });
    }
  }
  return out;
}

const hasDecl = (sel: string, prop: string, token: string, source: string = css): boolean =>
  declsOf(sel, source).some((d) => (d.prop === prop || d.prop.startsWith(`${prop}-`)) && d.value.includes(token));

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
  /** The stylesheet that holds the rule. Defaults to the landing stylesheets. */
  src?: 'showcase';
  bg: Bg;
  /** Element opacity that blends the text into the background. */
  opacity?: number;
  /** Large text (24 px, or 18.66 px bold) needs only 3:1. */
  large?: boolean;
};

const page: Bg = { layers: [] };
const glass = (...layers: string[]): Bg => ({ layers });
const theater = (...layers: string[]): Bg => ({ layers, root: '#170c31' });
const realPane = (...layers: string[]): Bg => ({ layers, root: '#f6ecd6' });
const orange = 'rgba(255,138,61,.20)';
const bone13 = 'rgba(247,240,225,.13)';
const card = 'rgba(255,255,255,.065)';
const witch = 'rgba(180,140,255,.12)';
const ctl = 'rgba(255,255,255,.05)';
const mint08 = 'rgba(174,245,223,.08)';
const bar = 'rgba(15,7,32,.94)';

const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
/** The page bar background, composited over the page background (it is 94% opaque). */
const PAGEBAR = ((c: Rgba): string => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`)(composite(['rgba(15,7,32,.94)']));

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
  { sel: '.built .chip', fg: 'var(--bone)', bg: glass(bone13, 'rgba(255,255,255,.07)') },
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
  { sel: '.rev-tag', fg: '#173b07', bg: glass('#9be564') },
  { sel: '.real', fg: '#3b2b10', bg: glass('#f6ecd6') },
  { sel: '.copy', fg: '#e9fff8', bg: theater(mint08) },
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
  { sel: '.chk', colorSel: '.copy', fg: '#e9fff8', bg: theater(witch, 'rgba(0,0,0,.25)') },
  { sel: '.chk.ok em', fg: 'var(--slime)', bg: theater(witch, 'rgba(0,0,0,.25)') },
  { sel: '.chk.bad em', fg: '#ff8b97', bg: theater('rgba(255,107,122,.1)', 'rgba(0,0,0,.25)') },
  { sel: '.eo', fg: 'var(--mint)', bg: theater(witch) },
  { sel: '.stamp.block', fg: '#ff8b97', bg: theater('rgba(255,255,255,.05)') },
  { sel: '.stamp.pass', fg: 'var(--slime)', bg: theater('rgba(255,255,255,.05)') },
  { sel: '.term', fg: '#e9e2ff', bg: glass('#0c0618') },
  { sel: '.say', fg: 'var(--ink)', bg: glass('#f7f0e1') },
  { sel: '.say p code', fg: '#3b2b10', bg: glass('#efe4c9') },
  { sel: '.live', fg: '#ffd0d6', bg: glass('rgba(255,107,122,.14)') },
  { sel: '.live.rec', fg: 'var(--dim)', bg: glass('rgba(255,255,255,.08)') },
  { sel: '.tab', fg: 'var(--dim)', bg: glass(ctl, 'rgba(0,0,0,.25)') },
  { sel: '.tab[aria-selected="true"]', colorSel: '.tab[aria-selected="true"]', fg: 'var(--ink)', bg: glass('#f7f0e1') },
  { sel: '.ghostbtn', fg: 'var(--dim)', bg: glass(ctl) },
  { sel: '.plan-l', fg: 'var(--dim)', bg: glass(ctl) },
  { sel: '.pr', fg: 'var(--slime)', bg: glass('#0c0618') },
  { sel: '.cmd', fg: '#efe9ff', bg: glass('#0c0618') },
  { sel: '.sl label', fg: 'var(--dim)', bg: glass(ctl) },
  { sel: '.sl b', fg: 'var(--text)', bg: glass(ctl) },
  { sel: '.runbtn', fg: '#08372a', bg: glass('#aef5df') },
  { sel: '.presets span', fg: 'var(--dim)', bg: glass(ctl) },
  { sel: '.presets button', fg: 'var(--pump2)', bg: glass(ctl) },
  { sel: '.presets button.on', fg: 'var(--text)', bg: glass(ctl) },
  { sel: '.stepper button', fg: 'var(--dim)', bg: page },
  { sel: '.stepper button.now', fg: 'var(--text)', bg: page },
  { sel: '.stepper button.done i', fg: '#173b07', bg: glass('#9be564') },
  { sel: '.stepper button.now i', fg: '#fff', bg: glass('#9046ff') },
  { sel: '.tag.pub', fg: '#3b2b10', bg: glass('#ffd36b') },
  { sel: '.node.new', fg: 'var(--slime)', bg: theater(mint08) },
  { sel: '.stamp.warn', fg: '#ffd36b', bg: theater('rgba(255,255,255,.05)') },
  // For task 13.1: Mockup_V5 has #7a5cc4 here (4.45:1); raised to #795bc3 to reach 4.5:1.
  { sel: '.say p small', fg: '#795bc3', bg: glass('#f7f0e1') },
  { sel: '.book', fg: '#ffe9cc', bg: glass('#2b1a12') },
  { sel: '.book-t', fg: 'var(--pump2)', bg: glass('#2b1a12') },
  { sel: '.book .c', fg: '#c9a27a', bg: glass('#2b1a12') },
  { sel: '.book .k', fg: 'var(--pump2)', bg: glass('#2b1a12') },
  { sel: '.agent p', fg: 'var(--dim)', bg: glass(witch) },
  { sel: '.agent .cmd', fg: 'var(--mint)', bg: glass('#140b26') },
  { sel: '.agent .proof', fg: 'var(--bone)', bg: glass(witch) },
  { sel: '.foot', fg: 'var(--dim)', bg: page },
  { sel: '.foot span', fg: 'var(--slime)', bg: glass('rgba(155,229,100,.1)') },
  // Task 8.4: the pairs that the paged landing mockup (Mockup_V6) adds. Requirement 18.6.
  { sel: '.pg-btn', fg: 'var(--text)', bg: glass(bar, 'rgba(255,255,255,.08)') },
  { sel: '.pg-next', fg: '#08372a', bg: glass('#aef5df') },
  { sel: '.pg-dot', fg: 'var(--dim)', bg: glass(bar) },
  { sel: '.pg-dot.on', fg: 'var(--text)', bg: glass(bar) },
  { sel: '.pg-count', fg: 'var(--dim)', bg: glass(bar) },
  // The small label of the Next button is drawn at opacity .7.
  { sel: '.pg-next', colorSel: '.pg-next', fg: '#08372a', opacity: 0.7, bg: glass('#aef5df') },
  // Task 8.4: the pairs that the Showcase mockup (Mockup_Kit) adds. The colors inside the Frames belong to the kit.
  { sel: '.kicker', src: 'showcase', fg: 'var(--ink)', bg: glass('#f7f0e1') },
  { sel: '.khero h1', colorSel: '.site', fg: 'var(--text)', bg: page, large: true },
  { sel: '.khero h1 em', src: 'showcase', fg: 'var(--mint)', bg: page, large: true },
  { sel: '.khero p', src: 'showcase', fg: 'var(--dim)', bg: page },
  { sel: '.kchips span', src: 'showcase', fg: 'var(--slime)', bg: glass('rgba(155,229,100,.1)') },
  { sel: '.kcard', src: 'showcase', fg: 'var(--text)', bg: glass('rgba(255,255,255,.06)') },
  { sel: '.kcard span', src: 'showcase', fg: 'var(--dim)', bg: glass('rgba(255,255,255,.06)') },
  { sel: '.kp-n', src: 'showcase', fg: 'var(--pump2)', bg: page },
  { sel: '.kpart h2', colorSel: '.site', fg: 'var(--text)', bg: page, large: true },
  { sel: '.kp-lead', src: 'showcase', fg: 'var(--bone)', bg: page },
  { sel: '.kpart ul', src: 'showcase', fg: 'var(--dim)', bg: page },
  { sel: '.foot', src: 'showcase', fg: 'var(--dim)', bg: page },
  { sel: '.foot a', src: 'showcase', fg: 'var(--mint)', bg: page },
];

type Border = {
  sel: string;
  prop: string;
  /** The border color token as written in the rule. */
  value: string;
  src?: 'showcase';
  /** What the border or graphic is painted over, bottom first. Defaults to the page background. */
  bg?: Bg;
  /** Opaque colors on the far side of the border; the border must reach 3:1 against each. Defaults to the page background. */
  against?: readonly string[];
};
const BORDERS: Border[] = [
  { sel: '.btn', prop: 'border', value: 'rgba(255,255,255,.34)' },
  { sel: '.xsw input', prop: 'border', value: 'rgba(255,255,255,.34)' },
  // Task 8.4. Graphics and borders of the page bar, the part cards, and the Frame. Requirement 18.6.
  { sel: '.pg-dot i', prop: 'background', value: 'rgba(255,255,255,.34)', bg: glass(bar), against: [PAGEBAR] },
  { sel: '.pg-dot.on i', prop: 'background', value: 'var(--pump)', bg: glass(bar), against: [PAGEBAR] },
  { sel: '.pg-btn:focus-visible,.pg-dot:focus-visible', prop: 'outline', value: 'var(--mint)', bg: glass(bar), against: [PAGEBAR] },
  { sel: '.kcard:hover', src: 'showcase', prop: 'border-color', value: 'var(--witch)' },
  { sel: '.kcard:focus-visible,.foot a:focus-visible', src: 'showcase', prop: 'outline', value: 'var(--mint)' },
  { sel: '.frame', src: 'showcase', prop: 'border', value: 'rgba(180,140,255,.58)', bg: { layers: [], root: '#0f0f17' }, against: [BASE, '#0f0f17'] },
];

const srcOf = (src: 'showcase' | undefined): string => (src === 'showcase' ? showcaseCss : landingCss);

const effective = (fg: Rgba, bg: Rgba, opacity = 1): Rgba => over({ ...fg, a: fg.a * opacity }, bg);

describe('contrast of text and borders (Requirement 15.7)', () => {
  it('has a curated table of pairs', () => {
    expect(TEXT.length).toBeGreaterThan(60);
    expect(BORDERS.length).toBeGreaterThan(0);
  });

  for (const p of TEXT) {
    const limit = p.large === true ? 3 : 4.5;
    it(`${p.sel}: ${p.fg} on ${[...p.bg.layers, p.bg.root ?? BASE].join(' / ')} is at least ${limit}`, () => {
      expect(hasDecl(p.colorSel ?? p.sel, 'color', p.fg, srcOf(p.src)), `color ${p.fg} in rule ${p.colorSel ?? p.sel}`).toBe(true);
      const bg = composite(p.bg.layers, p.bg.root);
      const fg = effective(parseColor(p.fg), bg, p.opacity);
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(limit);
    });
  }

  for (const b of BORDERS) {
    it(`${b.sel}: ${b.prop} ${b.value} is at least 3`, () => {
      expect(hasDecl(b.sel, b.prop, b.value, srcOf(b.src)), `${b.prop} ${b.value} in rule ${b.sel}`).toBe(true);
      const under = composite(b.bg?.layers ?? [], b.bg?.root);
      const border = over(parseColor(b.value), under);
      for (const other of b.against ?? [BASE]) {
        expect(ratio(border, parseColor(other)), `against ${other}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('contrast math matches known values', () => {
    expect(ratio(parseColor('#000'), parseColor('#fff'))).toBeCloseTo(21, 5);
    expect(ratio(parseColor('#777'), parseColor('#fff'))).toBeCloseTo(4.48, 2);
  });
});
