import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../../src/theme/tokens';
import type { Theme, ThemeTokens } from '../../src/theme/tokens';
import { parseCss } from '../support/css';

// theme.css mirrors THEMES. Validates: Requirements 11.5, 11.6

const compact = (v: string): string => v.replace(/\s+/g, '');

function themeBlocks(css: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const b of parseCss(css).blocks) {
    const m = /^\[data-theme=['"](\w+)['"]\]$/.exec(b.prelude);
    if (m === null) continue;
    out.set(m[1] ?? '', Object.fromEntries(b.decls.map((d) => [d.prop, d.value])));
  }
  return out;
}

function themeDifferences(css: string, themes: Record<Theme, ThemeTokens>): string[] {
  const blocks = themeBlocks(css);
  const out: string[] = [];
  for (const theme of ['dark', 'light'] as const) {
    const actual = blocks.get(theme);
    if (actual === undefined) {
      out.push(`${theme}: block missing`);
      continue;
    }
    const expected = themes[theme];
    for (const [name, value] of Object.entries(expected)) {
      const got = actual[name];
      if (got === undefined) out.push(`${theme}: ${name} missing in theme.css`);
      else if (compact(got) !== compact(value)) out.push(`${theme}: ${name} is ${got}, expected ${value}`);
    }
    for (const name of Object.keys(actual)) if (!(name in expected)) out.push(`${theme}: ${name} missing in THEMES`);
  }
  for (const key of blocks.keys()) if (key !== 'dark' && key !== 'light') out.push(`unexpected theme block ${key}`);
  return out;
}

const css = readFileSync(new URL('../../src/styles/theme.css', import.meta.url), 'utf8');

describe('theme.css matches THEMES', () => {
  it('has no difference in either theme', () => {
    expect(themeDifferences(css, THEMES)).toEqual([]);
  });

  it('both themes declare the same token names', () => {
    expect(Object.keys(THEMES.dark).sort()).toEqual(Object.keys(THEMES.light).sort());
  });

  it('self-test: reports a changed value, a missing token, and an extra token', () => {
    const changed = css.replace('#14111c', '#000000');
    expect(themeDifferences(changed, THEMES).length).toBeGreaterThan(0);
    const missing = css.replace(/\s*--gk-focus: #8ab4ff;/, '');
    expect(themeDifferences(missing, THEMES).some((d) => d.includes('--gk-focus missing in theme.css'))).toBe(true);
    const extra = css.replace("[data-theme='light'] {", "[data-theme='light'] {\n  --gk-extra: #123456;");
    expect(themeDifferences(extra, THEMES).some((d) => d.includes('--gk-extra missing in THEMES'))).toBe(true);
    expect(themeDifferences('', THEMES).length).toBe(2);
  });
});
