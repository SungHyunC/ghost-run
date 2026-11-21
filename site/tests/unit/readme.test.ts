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

  describe('Landing site statements', () => {
    const para = README.split('\n\n').find((p) => p.includes('five pages')) ?? '';

    it('names the five page hashes', () => {
      expect(para).toContain('The landing page at `/` has five pages');
      for (const h of ['#cover', '#recipe', '#costumes', '#run', '#make']) {
        expect(para).toContain('`' + h + '`');
      }
    });

    it('describes the /kit/ showcase and the developer gallery', () => {
      expect(para).toContain(
        '`/kit/` is a showcase of the real UI kit, rendered with the gallery\'s sample data',
      );
      expect(para).toContain('The developer gallery is at `/kit/gallery/`');
    });

    it('adds at most three lines', () => {
      const lines = para.split('\n').filter((l) => l.trim() !== '');
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.length).toBeLessThanOrEqual(3);
    });

    it('uses the replaced build sentence', () => {
      expect(README).toContain(
        'the kit showcase at `/kit/` and the kit gallery at `/kit/gallery/`',
      );
      expect(README).not.toContain('and the kit gallery at `/kit/`.');
    });

    it('has the v6 and kit showcase line in "Not written by Kiro"', () => {
      const start = README.indexOf('**Not written by Kiro**');
      const paragraph = README.slice(start).split('\n\n')[0] ?? '';
      expect(paragraph).toContain(
        'The paged landing mockup (v6) and the kit showcase mockup were made by Claude Code; Kiro built them.',
      );
    });
  });
});
