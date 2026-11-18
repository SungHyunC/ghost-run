import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTRAST_PAIRS } from '../../src/theme/tokens';
import { checkStylesheet, isLocalUrl, missingBackdropTokens, violationsOf } from '../support/css-rules';
import type { PairsByTheme } from '../support/css-rules';

// Stylesheet scan. Validates: Requirements 11.5, 11.6, 12.5, 12.6, 12.7, 12.9, 12.12, 13.4

const stylesDir = new URL('../../src/styles/', import.meta.url);
const files = readdirSync(stylesDir)
  .filter((f) => f.endsWith('.css'))
  .sort();
const sources = new Map(files.map((f) => [f, readFileSync(new URL(f, stylesDir), 'utf8')]));

const MOTION_TAIL = '@media (prefers-reduced-motion: reduce) { * { animation: none; transition: none; } }';

describe('stylesheets in src/styles', () => {
  it('include the four expected files', () => {
    expect(files).toEqual(expect.arrayContaining(['index.css', 'kit.css', 'motion.css', 'theme.css']));
  });

  it.each(files)('%s has no rule violation', (file) => {
    expect(checkStylesheet(file, sources.get(file) ?? '')).toEqual([]);
  });

  it('index.css imports exactly theme, kit, and motion', () => {
    const imports = [...(sources.get('index.css') ?? '').matchAll(/@import\s+'\.\/([\w-]+\.css)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['theme.css', 'kit.css', 'motion.css']);
  });

  it('keeps color literals out of every file but theme.css', () => {
    expect(sources.get('theme.css')).toMatch(/#[0-9a-f]{6}/i);
    for (const f of files.filter((n) => n !== 'theme.css')) expect(sources.get(f)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('declares every foreground token against all three backdrops', () => {
    expect([...missingBackdropTokens(CONTRAST_PAIRS)]).toEqual([]);
  });

  it('keeps animation, transition, and keyframes in motion.css only', () => {
    for (const f of files.filter((n) => n !== 'motion.css')) {
      expect(sources.get(f)?.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/@keyframes|animation|transition/);
    }
    expect(sources.get('motion.css')).toMatch(/@keyframes/);
  });
});

const noFogPairs: PairsByTheme = {
  dark: CONTRAST_PAIRS.dark.filter((p) => !(p.fg === '--gk-text' && p.bg === '--gk-fog')),
  light: CONTRAST_PAIRS.light,
};

interface Bad {
  readonly rule: string;
  readonly file: string;
  readonly css: string;
  readonly pairs?: PairsByTheme;
}

const BAD: readonly Bad[] = [
  { rule: 'color-literal', file: 'kit.css', css: '.a { color: #fff; }' },
  { rule: 'color-literal', file: 'kit.css', css: '.a { background: rgba(0, 0, 0, 0.5); }' },
  { rule: 'color-literal', file: 'kit.css', css: '.a { border: 1px solid red; }' },
  { rule: 'unknown-token', file: 'kit.css', css: '.a { color: var(--gk-nope); }' },
  { rule: 'pair-undeclared', file: 'kit.css', css: '.a { color: var(--gk-muted); background: var(--gk-bl-fill); }' },
  { rule: 'fg-undeclared', file: 'kit.css', css: '.a { color: var(--gk-flame); }' },
  { rule: 'fg-backdrops', file: 'kit.css', css: '.a { color: var(--gk-text); }', pairs: noFogPairs },
  { rule: 'motion-location', file: 'kit.css', css: '.a { animation: x 0.2s 1; }' },
  { rule: 'motion-location', file: 'kit.css', css: '.a { transition: color 0.2s; }' },
  { rule: 'motion-location', file: 'kit.css', css: '@keyframes x { from { color: inherit; } }' },
  { rule: 'animation-infinite', file: 'motion.css', css: `.a { animation: x 0.5s infinite; } ${MOTION_TAIL}` },
  { rule: 'animation-finite', file: 'motion.css', css: `.a { animation: x 0.5s ease; } ${MOTION_TAIL}` },
  { rule: 'animation-duration', file: 'motion.css', css: `.a { animation: x 1.2s 1; } ${MOTION_TAIL}` },
  { rule: 'animation-total', file: 'motion.css', css: `.a { animation: x 0.9s 4; } ${MOTION_TAIL}` },
  { rule: 'reduced-motion-last', file: 'motion.css', css: '.a { animation: x 0.2s 1; }' },
  {
    rule: 'reduced-motion-last',
    file: 'motion.css',
    css: `${MOTION_TAIL} .a { animation: x 0.2s 1; }`,
  },
  { rule: 'opacity', file: 'kit.css', css: '.a { opacity: 0.5; }' },
  { rule: 'opacity', file: 'kit.css', css: '.a { opacity: var(--x); }' },
  { rule: 'filter', file: 'kit.css', css: '.a { filter: blur(2px); }' },
  { rule: 'filter', file: 'kit.css', css: '.a { backdrop-filter: blur(2px); }' },
  { rule: 'font-face-source', file: 'kit.css', css: "@font-face { font-family: X; src: url('https://x.example/f.woff2'); }" },
  { rule: 'font-face-source', file: 'kit.css', css: '@font-face { font-family: X; src: url(//x.example/f.woff2); }' },
  { rule: 'url-outside', file: 'kit.css', css: ".a { background: url('https://x.example/a.png'); }" },
  { rule: 'no-import', file: 'kit.css', css: "@import './other.css';" },
  { rule: 'no-import', file: 'theme.css', css: "@import url('https://x.example/a.css');" },
  { rule: 'import-nonlocal', file: 'index.css', css: "@import url('https://fonts.example/css?family=X');" },
  { rule: 'import-nonlocal', file: 'index.css', css: "@import 'https://x.example/a.css';" },
  { rule: 'import-nonlocal', file: 'index.css', css: "@import '//x.example/a.css';" },
  { rule: 'import-nonlocal', file: 'index.css', css: "@import '../x.css';" },
  { rule: 'import-nonlocal', file: 'index.css', css: "@import './fonts.css';" },
  { rule: 'syntax', file: 'kit.css', css: '.a { color: inherit;' },
];

describe('self-test: each rule fails on a bad sample', () => {
  it.each(BAD.map((b, i) => [`${b.rule} #${i}`, b] as const))('%s', (_name, bad) => {
    const found = checkStylesheet(bad.file, bad.css, bad.pairs === undefined ? {} : { pairs: bad.pairs });
    expect(violationsOf(bad.rule, found).length).toBeGreaterThan(0);
  });

  it('covers every rule id at least once', () => {
    const covered = new Set(BAD.map((b) => b.rule));
    expect([...covered].sort()).toEqual(
      [
        'animation-duration',
        'animation-finite',
        'animation-infinite',
        'animation-total',
        'color-literal',
        'fg-backdrops',
        'fg-undeclared',
        'filter',
        'font-face-source',
        'import-nonlocal',
        'motion-location',
        'no-import',
        'opacity',
        'pair-undeclared',
        'reduced-motion-last',
        'syntax',
        'unknown-token',
        'url-outside',
      ].sort(),
    );
  });
});

describe('self-test: good samples pass', () => {
  it('accepts tokens, currentColor, transparent, inherit', () => {
    const css = '.a { color: var(--gk-text); background: var(--gk-surface); border: 1px solid currentColor; outline-color: transparent; fill: inherit; }';
    expect(checkStylesheet('kit.css', css)).toEqual([]);
  });

  it('accepts local relative imports only in index.css', () => {
    expect(checkStylesheet('index.css', "@import './theme.css';\n@import './kit.css';")).toEqual([]);
  });

  it('accepts a bounded animation and a relative font source', () => {
    const css = `@keyframes x { from { fill-opacity: 0; } to { fill-opacity: 1; } } .a { animation: x 0.6s ease-in-out 3; } ${MOTION_TAIL}`;
    expect(checkStylesheet('motion.css', css)).toEqual([]);
    expect(checkStylesheet('kit.css', "@font-face { font-family: X; src: url('./x.woff2'); }")).toEqual([]);
  });

  it('classifies urls', () => {
    expect(isLocalUrl('./a.woff2')).toBe(true);
    expect(isLocalUrl('https://x.example/a')).toBe(false);
    expect(isLocalUrl('//x.example/a')).toBe(false);
    expect(isLocalUrl('/abs/a')).toBe(false);
  });
});
