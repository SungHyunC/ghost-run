import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const README = readFileSync(resolve(here, '../../../README.md'), 'utf8');
const rows = README.split('\n').filter((l) => l.startsWith('|'));

describe('README site documentation', () => {
  it('states the build command and the output folder', () => {
    expect(README).toContain('pnpm build:site');
    expect(README).toContain('site/dist/');
  });

  it('has a Ghost Cloud row in the skeleton table', () => {
    const row = rows.find((l) => l.includes('worlds/ghost-cloud/'));
    expect(row).toBeDefined();
    expect(row).toContain('world-smith');
    expect(row).toContain('no real mode');
  });

  it('has the Claude Code mockup line in the "Not written by Kiro" paragraph', () => {
    const start = README.indexOf('**Not written by Kiro**');
    expect(start).toBeGreaterThanOrEqual(0);
    const paragraph = README.slice(start).split('\n\n')[0] ?? '';
    expect(paragraph).toContain('landing page design draft (mockup) was made by Claude Code');
    expect(paragraph).toContain('Kiro built the page from it');
  });

  it('lists @fontsource/fredoka with OFL-1.1 and the favicon', () => {
    const font = rows.find((l) => l.includes('@fontsource/fredoka'));
    expect(font).toContain('OFL-1.1');
    const icon = rows.find((l) => l.includes('site/public/favicon.svg'));
    expect(icon).toContain('original');
  });
});
