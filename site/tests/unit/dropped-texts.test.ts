import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANDING_DROPPED, SHOWCASE_DROPPED, findInSource, findRendered, type Dropped } from '../lib/dropped-texts';

// Feature: site-pages, Property Pg4: Dropped texts stay dropped (source and built text)
// **Validates: Requirements 12.1, 12.2, 12.5, 12.6**

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(SITE, 'src');
const DIST = join(SITE, 'dist');
const TEXT = /\.(ts|tsx|js|mjs|css|json|html|svg|txt)$/;
const ALL = [...LANDING_DROPPED, ...SHOWCASE_DROPPED];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
    return e.isFile() && TEXT.test(e.name) ? [full] : [];
  });
}

/** Files of `files` that hold a dropped text, with the texts. */
function scan(files: string[], list: readonly Dropped[] = ALL): string[] {
  return files.flatMap((f) => {
    const found = findInSource(readFileSync(f, 'utf8'), list);
    return found.length > 0 ? [`${relative(SITE, f)}: ${JSON.stringify(found)}`] : [];
  });
}

describe('dropped texts in source and build output', () => {
  it('holds the lists as literals', () => {
    expect(LANDING_DROPPED.length).toBeGreaterThan(25);
    expect(SHOWCASE_DROPPED.length).toBeGreaterThan(10);
  });

  it('src/ outside the test files holds none of them', () => {
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(20);
    // The Showcase folder may say `ui/` (its footer); it is held to the Showcase list only.
    const isShowcase = (f: string): boolean => f.startsWith(join(SRC, 'showcase') + '/');
    expect([...scan(files.filter((f) => !isShowcase(f))), ...scan(files.filter(isShowcase), SHOWCASE_DROPPED)]).toEqual([]);
  });

  it('site/dist/ text holds none of them', (ctx) => {
    if (!existsSync(DIST)) {
      console.log('dropped-texts: site/dist/ does not exist yet; the built-text scan is skipped');
      ctx.skip();
      return;
    }
    const files = walk(DIST).filter((f) => !/THIRD_PARTY_NOTICES/.test(f));
    // The Showcase build (kit/ and the showcase- assets) may say `ui/`; the rest is held to both lists.
    const isKit = (f: string): boolean => f.startsWith(join(DIST, 'kit') + '/') || f.startsWith(join(DIST, 'assets', 'showcase-'));
    expect([...scan(files.filter((f) => !isKit(f))), ...scan(files.filter(isKit), SHOWCASE_DROPPED)]).toEqual([]);
  });

  it('the check fails on a fixture with the folder line "core/ · ui/"', () => {
    const fixture = '<div class="part"><b>Ghost</b><code>core/ · ui/</code></div>';
    expect(findInSource(fixture, LANDING_DROPPED)).toContain('core/ · ui/');
    expect(findInSource('<code>core/</code>', LANDING_DROPPED)).toEqual(['core/']);
    expect(findInSource("import x from '../core/x'", LANDING_DROPPED)).toEqual([]);
    expect(findRendered({ text: 'core/ · ui/', nodes: [], attrs: [] }, LANDING_DROPPED)).toEqual(['core/ · ui/']);
  });
});
