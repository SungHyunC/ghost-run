import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stylesDir = join(siteRoot, 'src', 'styles');
const FILES = [
  '00-fonts',
  '01-base',
  '01-nav',
  '02-nav-hero',
  '03-recipe',
  '04-costumes',
  '05-walkthrough',
  '06-pane-content',
  '07-judge',
  '08-actor-say',
  '09-make-footer',
  '10-motion',
  '12-book',
  '99-page',
  '11-responsive',
  '13-fit',
].map((n) => `${n}.css`);

const read = (f: string): string => readFileSync(join(stylesDir, f), 'utf8');

describe('stylesheets', () => {
  it('has every stylesheet file', () => {
    for (const f of FILES) expect(existsSync(join(stylesDir, f)), f).toBe(true);
    expect(readdirSync(stylesDir).sort()).toEqual([...FILES].sort());
  });

  it('imports the Fredoka weights and the stylesheets in order, 13-fit (the review fixes) last', () => {
    const main = readFileSync(join(siteRoot, 'src', 'main.tsx'), 'utf8');
    const imports = [...main.matchAll(/^import '([^']+\.css)';$/gm)].map((m) => m[1]);
    expect(imports.slice(0, 4)).toEqual([
      '@fontsource/fredoka/latin-400.css',
      '@fontsource/fredoka/latin-500.css',
      '@fontsource/fredoka/latin-600.css',
      '@fontsource/fredoka/latin-700.css',
    ]);
    expect(imports.slice(4)).toEqual(FILES.map((f) => `./styles/${f}`));
    expect(imports[imports.length - 1]).toBe('./styles/13-fit.css');
  });

  it('drops the mockup wrapper rules and the rounded frame', () => {
    const all = FILES.map(read).join('\n');
    expect(all).not.toMatch(/\.doc\b/);
    expect(all).not.toMatch(/\.guide/);
    const site = read('01-base.css').split('\n').slice(0, 4).join('\n');
    expect(site).not.toContain('border-radius:24px');
    expect(site).not.toContain('overflow:hidden');
  });

  it('has no import or external or data URL', () => {
    for (const f of FILES) {
      const css = read(f);
      expect(css, f).not.toMatch(/@import/);
      expect(css, f).not.toMatch(/https?:/);
      expect(css, f).not.toMatch(/data:/);
    }
  });

  it('keeps the narrow-screen blocks last and the reduced-motion block', () => {
    const last = read('11-responsive.css');
    expect(last).toContain('@media (max-width:820px)');
    expect(last).toContain('@media (max-width:560px)');
    expect(read('10-motion.css')).toContain('@media (prefers-reduced-motion:reduce)');
    const motion = read('10-motion.css');
    const reduced = motion.slice(motion.indexOf('@media (prefers-reduced-motion:reduce)'));
    for (const c of ['.bigcandle.flicker .flame', '.stepper i', '.ward.scan', '.beam-on .beam path', '.tile.fail']) {
      expect(reduced, c).toContain(c);
    }
    expect(read('11-responsive.css')).toContain('@media (max-width:760px)');
  });

  it('carries the v5 section rules and no rule of the old section', () => {
    const sec = ['05-walkthrough', '06-pane-content', '07-judge', '08-actor-say'].map((n) => read(`${n}.css`)).join('\n');
    for (const old of ['.wbar', '.wchip', '.rail', '.wchips', '.replay', '.seal']) {
      expect(sec, old).not.toMatch(new RegExp(`${old.replace('.', '\\.')}(?![\\w-])\\s*[{,\\[.:]`));
    }
    for (const rule of [
      '.live{', '.live.rec{', '.ctl{', '.tabs{', '.planbox{', '.presets{', '.stepper{', '.stepper button[aria-disabled="true"]{',
      '.panes{', '.judge{', '.stamp.warn{', '.tag.pub{', '.node.new{', '.say p small{', '.actor{',
    ]) {
      expect(sec, rule).toContain(rule);
    }
    expect(read('10-motion.css')).toContain('.bigcandle.flicker .flame{');
  });

  it('applies the listed changes', () => {
    expect(read('01-nav.css')).toContain('.nav-links a.on{');
    expect(read('01-nav.css')).toContain('.logo{');
    expect(read('02-nav-hero.css')).not.toContain('.nav{');
    expect(read('02-nav-hero.css')).not.toContain('.nav-links span');
    const base = read('01-base.css');
    for (const s of ['html,body{', '.site{min-height:100vh;overflow-x:clip}', '.sprite{position:absolute}', '.sr-only{']) {
      expect(base).toContain(s);
    }
    const page = read('99-page.css');
    expect(page).toContain('.wrap{max-width:1040px');
    expect(page).not.toMatch(/\.page\b/);
    expect(page).toContain('.jl{');
    for (const s of ['.sprite{', '.sr-only{', 'html,body']) expect(page).not.toContain(s);
  });

  it('keeps the paging rules in 12-book.css', () => {
    const book = read('12-book.css');
    expect(book).toMatch(/\.page\{display:none;/);
    expect(book).toContain('.page.on{position:relative}');
    expect(book).toContain('.page.on,.page.leave-next,.page.enter-back{display:block}');
    expect(book).toContain('100svh');
    expect(book).toContain('--nav-h');
    expect(book).toContain('--bar-h');
    expect(book).toContain('.pagebar{position:sticky;bottom:0');
    for (const k of ['turnOut', 'turnIn', 'pageIn']) expect(book).toContain(`@keyframes ${k}`);
    const reduced = book.slice(book.indexOf('@media (prefers-reduced-motion:reduce)'));
    for (const c of ['.page.leave-next', '.page.enter-back', '.page.fade-in', '.pg-dot', '.pg-btn']) {
      expect(reduced, c).toContain(c);
    }
    expect(reduced).toContain('animation:none');
    // 24 px hit areas
    expect(book).toMatch(/\.pg-btn\{[^}]*min-width:24px;min-height:24px/);
    expect(book).toMatch(/\.pg-dot\{[^}]*min-width:24px;min-height:24px/);
    expect(book).toContain('@media (max-width:390px)');
  });
});
