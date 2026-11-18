import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as kit from '../src/ui-imports';

const here = dirname(fileURLToPath(import.meta.url));

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listSources(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('cross-spec prerequisites (run time)', () => {
  it('exports escapeForDisplay and isHiddenDisplay from @ghost-run/ui', () => {
    expect(typeof kit.escapeForDisplay).toBe('function');
    expect(typeof kit.isHiddenDisplay).toBe('function');
    expect(typeof kit.Candle).toBe('function');
  });

  it('escapes U+200B in the <U+200B> form', () => {
    const zeroWidth = String.fromCodePoint(0x200b);
    expect(kit.isHiddenDisplay(0x200b)).toBe(true);
    expect(kit.isHiddenDisplay(0x61)).toBe(false);
    const out = kit.escapeForDisplay(`a${zeroWidth}b`);
    expect(out).toContain('<U+200B>');
    expect(out).not.toContain(zeroWidth);
  });

  it('resolves @ghost-run/wards-config to an entry graph without node: imports', async () => {
    // The package is a workspace link; its browser entry is the "." export (dist/src/index.js).
    const pkgDir = resolve(here, '../node_modules/@ghost-run/wards-config');
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { exports: Record<string, { import: string }> };
    const entry = resolve(pkgDir, (pkg.exports['.'] as { import: string }).import);
    expect(existsSync(entry)).toBe(true);
    await import('@ghost-run/wards-config');
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file) || !existsSync(file)) continue;
      seen.add(file);
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/from\s+['"]node:|import\(\s*['"]node:|require\(\s*['"]node:/);
      for (const m of text.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)) {
        queue.push(resolve(dirname(file), m[1] as string));
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('never imports @ghost-run/wards-config/node under apps/ghost-shell/src', () => {
    const needle = ['wards-config', 'node'].join('/');
    for (const file of listSources(resolve(here, '../src'))) {
      expect(readFileSync(file, 'utf8'), file).not.toContain(needle);
    }
  });
});
