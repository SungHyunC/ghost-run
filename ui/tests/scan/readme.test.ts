import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// README guard for @ghost-run/ui. Validates: Requirements 1.9, 4.7, 13.5, 16.6

const uiRoot = new URL('../../', import.meta.url);
const repoRoot = new URL('../../../', import.meta.url);

const uiReadme = readFileSync(new URL('README.md', uiRoot), 'utf8');
// The repository README moved its detail sections to docs/: the secret-like key rule to docs/ui-kit.md, the tables to
// docs/dependencies.md.
const repoUiDoc = readFileSync(new URL('docs/ui-kit.md', repoRoot), 'utf8');
const repoDeps = readFileSync(new URL('docs/dependencies.md', repoRoot), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('package.json', uiRoot), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const PHRASES = [
  'case-insensitive containment',
  'heuristic',
  'innocent key name',
  'harmless value',
  'responsible for redaction',
];

function tableRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .slice(1, line.endsWith('|') ? -1 : undefined)
        .split('|')
        .map((cell) => cell.trim()),
    );
}

function findRow(rows: string[][], name: string): string[] | undefined {
  return rows.find((cells) => {
    const first = cells[0] ?? '';
    return first === name || first.includes(`(\`${name}\`)`);
  });
}

describe('Secret-like key rule section', () => {
  describe.each([
    ['ui/README.md', uiReadme],
    ['docs/ui-kit.md', repoUiDoc],
  ])('%s', (_label, text) => {
    it('has the heading', () => {
      expect(text).toMatch(/^#{2,4} Secret-like key rule\s*$/m);
    });

    it.each(PHRASES)('contains the phrase "%s" in the section', (phrase) => {
      const start = text.search(/^#{2,4} Secret-like key rule\s*$/m);
      expect(start).toBeGreaterThanOrEqual(0);
      const rest = text.slice(start).replace(/^#{2,4} Secret-like key rule\s*$/m, '');
      const next = rest.search(/^#{1,4} /m);
      const section = next === -1 ? rest : rest.slice(0, next);
      expect(section).toContain(phrase);
    });
  });
});

describe('repository dependency table (docs/dependencies.md)', () => {
  const rows = tableRows(repoDeps);
  const all = { ...pkg.dependencies, ...pkg.devDependencies };

  it('lists axe-core with MPL-2.0 and a dev-only, not-shipped note', () => {
    const row = findRow(rows, 'axe-core');
    expect(row).toBeDefined();
    expect(row?.[3]).toBe('MPL-2.0');
    expect(row?.[2]).toMatch(/dev dependency/i);
    expect(row?.[2]).toMatch(/not shipped/i);
  });

  it.each(Object.entries(all))('lists %s with a version and a license', (name, range) => {
    const row = findRow(rows, name);
    expect(row, `${name} is missing from the table in docs/dependencies.md`).toBeDefined();
    const version = row?.[1] ?? '';
    const license = row?.[row.length - 1] ?? '';
    expect(version).toMatch(/\d/);
    expect(license.length).toBeGreaterThan(0);
    if (!range.startsWith('workspace:')) {
      const major = /(\d+)\./.exec(range)?.[1];
      expect(version.startsWith(`${major ?? ''}.`)).toBe(true);
    }
  });
});

describe('asset tables', () => {
  it('docs/dependencies.md lists the original SVG source and ships no font and no audio', () => {
    const row = tableRows(repoDeps).find((cells) => (cells[0] ?? '').startsWith('Fonts, icons, and assets of `ui`'));
    expect(row).toBeDefined();
    const note = row?.join(' | ') ?? '';
    expect(note).toMatch(/original SVG/);
    expect(note).toMatch(/Fonts: none/);
    expect(note).toMatch(/Audio: none/);
  });

  it('ui README lists the original SVG source and ships no font and no audio', () => {
    const rows = tableRows(uiReadme);
    const svg = rows.filter((cells) => /original SVG/i.test(cells[1] ?? ''));
    expect(svg.length).toBeGreaterThan(0);
    const font = rows.find((cells) => cells[0] === 'Fonts');
    const audio = rows.find((cells) => cells[0] === 'Audio');
    expect(font?.[1]).toMatch(/^None/);
    expect(audio?.[1]).toMatch(/^None/);
  });
});
