import { CONTRAST_PAIRS, DECORATIVE_TOKENS, THEMES } from '../../src/theme/tokens';
import type { ContrastPair, Theme } from '../../src/theme/tokens';
import { parseCss } from './css';
import type { CssBlock, CssDecl } from './css';

// Stylesheet rules of the ui kit. Each violation is a string `<rule-id>: <detail>`.

export type PairsByTheme = Record<Theme, readonly ContrastPair[]>;

export interface ScanOptions {
  readonly pairs?: PairsByTheme;
}

export const RULE_IDS = [
  'syntax',
  'color-literal',
  'unknown-token',
  'pair-undeclared',
  'fg-undeclared',
  'fg-backdrops',
  'motion-location',
  'animation-infinite',
  'animation-finite',
  'animation-duration',
  'animation-total',
  'reduced-motion-last',
  'opacity',
  'filter',
  'font-face-source',
  'url-outside',
  'no-import',
  'import-nonlocal',
] as const;

export const BACKDROP_TOKENS = ['--gk-bg', '--gk-surface', '--gk-fog'] as const;

const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
    'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
    'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
    'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
    'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
    'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
    'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
    'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

const COLOR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\s*\(/i;
const HEX_COLOR = /#[0-9a-f]{3,8}\b/i;
const FG_PROP =
  /^(?:color|fill|stroke|text-decoration-color|caret-color|(?:border|outline|column-rule)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?)$/;
const COLOR_NAME_PROP = /^(?:background|background-color|box-shadow|text-shadow|accent-color|scrollbar-color)$/;
const BG_PROP = /^(?:background|background-color)$/;

function stripStrings(value: string): string {
  return value.replace(/"[^"]*"|'[^']*'/g, '""');
}

function stripUrls(value: string): string {
  return value.replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/gi, 'url()');
}

function varTokens(value: string): string[] {
  return [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] ?? '');
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur.trim());
  return parts;
}

function toSeconds(token: string): number | undefined {
  const m = /^(-?\d*\.?\d+)(ms|s)$/i.exec(token);
  if (m === null) return undefined;
  const n = Number(m[1]);
  return (m[2] ?? '').toLowerCase() === 'ms' ? n / 1000 : n;
}

export function isLocalUrl(raw: string): boolean {
  const u = raw.trim().replace(/^["']|["']$/g, '');
  if (u === '') return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return false;
  if (u.startsWith('/')) return false;
  if (/^(?:\.\.\/)+/.test(u) && u.split('/').filter((s) => s === '..').length > 1) return false;
  return true;
}

export function urlsIn(value: string): string[] {
  return [...value.matchAll(/url\(\s*("[^"]*"|'[^']*'|[^)]*?)\s*\)/gi)].map((m) => m[1] ?? '');
}

const LOCAL_IMPORT = /^@import\s+(?:url\(\s*)?(["'])(\.\/[A-Za-z0-9_-]+\.css)\1\s*\)?$/;

function checkAnimationDecl(d: CssDecl, out: string[]): void {
  const value = d.value.toLowerCase();
  if (d.prop === 'animation') {
    if (value === 'none') return;
    for (const part of splitTopLevel(value)) {
      const tokens = part.replace(/\([^)]*\)/g, '()').split(/\s+/).filter((t) => t !== '');
      const times = tokens.map(toSeconds).filter((n): n is number => n !== undefined);
      const duration = times[0] ?? 0;
      const delay = times[1] ?? 0;
      const countToken = tokens.find((t) => /^\d*\.?\d+$/.test(t) || t === 'infinite');
      if (countToken === undefined || countToken === 'infinite') {
        out.push(`animation-finite: no finite iteration count in "${d.value}"`);
        continue;
      }
      if (duration > 1) out.push(`animation-duration: ${duration}s exceeds 1 s in "${d.value}"`);
      const total = duration * Number(countToken) + Math.max(delay, 0);
      if (total > 3) out.push(`animation-total: ${total}s exceeds 3 s in "${d.value}"`);
    }
  } else if (d.prop === 'animation-duration') {
    for (const part of splitTopLevel(value)) {
      const s = toSeconds(part);
      if (s === undefined || s > 1) out.push(`animation-duration: "${part}" is not at most 1 s`);
    }
  } else if (d.prop === 'animation-iteration-count') {
    for (const part of splitTopLevel(value)) {
      if (!/^\d*\.?\d+$/.test(part)) out.push(`animation-finite: "${part}" is not a finite count`);
    }
  }
}

function checkOpacity(d: CssDecl, out: string[]): void {
  const m = /^(\d*\.?\d+)(%?)$/.exec(d.value.trim());
  if (m === null) {
    out.push(`opacity: "${d.value}" is not a literal 1`);
    return;
  }
  const n = Number(m[1]) / (m[2] === '%' ? 100 : 1);
  if (n < 1) out.push(`opacity: ${d.value} is below 1`);
}

function checkBlock(file: string, block: CssBlock, pairs: PairsByTheme, definedVars: Set<string>, out: string[]): void {
  const isTheme = file === 'theme.css';
  const isMotion = file === 'motion.css';
  const where = block.prelude;
  const fgNeeds = missingBackdropTokens(pairs);
  const fgDeclared = new Set<string>();
  const bgDeclared = new Set<string>();
  for (const p of [...pairs.dark, ...pairs.light]) {
    fgDeclared.add(p.fg);
    bgDeclared.add(p.bg);
  }

  if (/^@font-face\b/i.test(block.prelude)) {
    for (const d of block.decls) {
      if (d.prop !== 'src') continue;
      const urls = urlsIn(d.value);
      if (urls.length === 0 || urls.some((u) => !isLocalUrl(u))) out.push(`font-face-source: "${d.value}"`);
    }
  }
  if (/^@keyframes\b/i.test(block.prelude) && !isMotion) out.push(`motion-location: ${where}`);

  let fgToken: string | undefined;
  const bgTokens: string[] = [];

  for (const d of block.decls) {
    const bare = stripUrls(stripStrings(d.value));
    if (!isTheme) {
      if (HEX_COLOR.test(bare) || COLOR_FUNCTION.test(bare)) out.push(`color-literal: ${d.prop}: ${d.value} in ${where}`);
      else if (!d.prop.startsWith('--') && (FG_PROP.test(d.prop) || COLOR_NAME_PROP.test(d.prop))) {
        const words = bare.replace(/var\([^)]*\)/g, ' ').toLowerCase().split(/[\s,/]+/);
        for (const w of words) if (NAMED_COLORS.has(w)) out.push(`color-literal: ${d.prop}: ${d.value} in ${where}`);
      }
    }
    for (const t of varTokens(d.value)) {
      if (t.startsWith('--gk-') && !(t in THEMES.dark) && !(t in THEMES.light) && !definedVars.has(t)) {
        out.push(`unknown-token: ${t} in ${where}`);
      }
    }
    if (/^(?:animation|transition)(?:-|$)/.test(d.prop) && !isMotion) out.push(`motion-location: ${d.prop} in ${where}`);
    if (d.prop.startsWith('animation')) checkAnimationDecl(d, out);
    if (d.prop === 'opacity') checkOpacity(d, out);
    if (/^(?:-webkit-)?(?:backdrop-)?filter$/.test(d.prop) && d.value.trim().toLowerCase() !== 'none') {
      out.push(`filter: ${d.prop}: ${d.value} in ${where}`);
    }
    for (const u of urlsIn(d.value)) if (!isLocalUrl(u)) out.push(`url-outside: ${u} in ${where}`);

    if (d.prop === 'color') fgToken = varTokens(d.value)[0] ?? fgToken;
    if (BG_PROP.test(d.prop)) bgTokens.push(...varTokens(d.value));
    if (FG_PROP.test(d.prop) && !d.prop.startsWith('--')) {
      for (const t of varTokens(d.value)) {
        if (!t.startsWith('--gk-') || t.startsWith('--gk-font')) continue;
        const fillLike = d.prop !== 'color' && (bgDeclared.has(t) || DECORATIVE_TOKENS.includes(t));
        if (fillLike) continue;
        if (!fgDeclared.has(t)) out.push(`fg-undeclared: ${t} used by ${d.prop} in ${where}`);
        else if (fgNeeds.has(t)) out.push(`fg-backdrops: ${t} is not declared against all three backdrops (${where})`);
      }
    }
  }

  if (fgToken !== undefined) {
    for (const bg of bgTokens) {
      for (const theme of ['dark', 'light'] as const) {
        if (!pairs[theme].some((p) => p.fg === fgToken && p.bg === bg)) {
          out.push(`pair-undeclared: ${fgToken} on ${bg} (${theme}) in ${where}`);
        }
      }
    }
  }
}

/** Foreground tokens that have a pair with a backdrop but miss at least one of the three backdrops. */
export function missingBackdropTokens(pairs: PairsByTheme): Set<string> {
  const bad = new Set<string>();
  for (const theme of ['dark', 'light'] as const) {
    const byFg = new Map<string, Set<string>>();
    for (const p of pairs[theme]) {
      const set = byFg.get(p.fg) ?? new Set<string>();
      set.add(p.bg);
      byFg.set(p.fg, set);
    }
    for (const [fg, bgs] of byFg) {
      const special = [...bgs].some((b) => !(BACKDROP_TOKENS as readonly string[]).includes(b));
      if (special) continue;
      if (BACKDROP_TOKENS.some((b) => !bgs.has(b))) bad.add(fg);
    }
  }
  return bad;
}

export function checkStylesheet(file: string, css: string, options: ScanOptions = {}): string[] {
  const pairs = options.pairs ?? CONTRAST_PAIRS;
  const parsed = parseCss(css);
  const out: string[] = [];
  if (!parsed.balanced) out.push('syntax: unbalanced braces or quotes');

  const definedVars = new Set<string>();
  for (const b of parsed.blocks) for (const d of b.decls) if (d.prop.startsWith('--')) definedVars.add(d.prop);

  for (const block of parsed.blocks) checkBlock(file, block, pairs, definedVars, out);

  const text = stripStrings(parsed.stripped);
  if (/\binfinite\b/i.test(text)) out.push('animation-infinite: the word infinite appears');
  if (/@keyframes\b/i.test(text) && file !== 'motion.css') out.push('motion-location: @keyframes');

  for (const s of parsed.statements) {
    if (!/^@import\b/i.test(s)) continue;
    if (file !== 'index.css') out.push(`no-import: ${s}`);
    else if (!LOCAL_IMPORT.test(s) || /font/i.test(s)) out.push(`import-nonlocal: ${s}`);
  }

  if (file === 'motion.css') {
    const tail =
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[^{}]*\{([^{}]*)\}\s*\}$/.exec(parsed.stripped.trim());
    const body = tail?.[1] ?? '';
    if (tail === null || !/animation\s*:\s*none/.test(body) || !/transition\s*:\s*none/.test(body)) {
      out.push('reduced-motion-last: the file does not end with the prefers-reduced-motion block');
    }
  }
  return out;
}

export function violationsOf(rule: string, violations: readonly string[]): string[] {
  return violations.filter((v) => v.startsWith(`${rule}:`));
}
