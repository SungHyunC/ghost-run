// The site's own third-party notices: which packages the landing bundle holds, what the notices file says about
// them, and the site check that fails when a bundled package is missing from it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

type Pkg = { name: string; version: string; license: string; dir: string };
type Finding = { file: string; reference: string; rule: string };

// Loaded by variable path so that the plain .mjs scripts need no type declaration files.
const bundledPath = '../../scripts/lib/bundled-packages.mjs';
const noticesPath = '../../scripts/lib/notices.mjs';
const checkPath = '../../scripts/check-site.mjs';
const { packageOfId, idsOfBundle } = (await import(/* @vite-ignore */ bundledPath)) as {
  packageOfId: (id: string) => { name: string; dir: string } | null;
  idsOfBundle: (bundle: Record<string, unknown>) => string[];
};
const { renderNotices, missingFromNotices } = (await import(/* @vite-ignore */ noticesPath)) as {
  renderNotices: (input: { root: string; packages: Pkg[] }) => string;
  missingFromNotices: (text: string, packages: readonly { name: string; version: string }[]) => { name: string; version: string }[];
};
const { checkSite, RULE_NOTICE_PACKAGE, RULE_NOTICE_LIST } = (await import(/* @vite-ignore */ checkPath)) as {
  checkSite: (distRoot: string, options?: { structure?: boolean; bundledPackages?: string | readonly { name: string; version: string }[] }) => Finding[];
  RULE_NOTICE_PACKAGE: string;
  RULE_NOTICE_LIST: string;
};

const roots: string[] = [];
function tmp(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'ghost-notices-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function put(root: string, rel: string, text: string): void {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
}

describe('packageOfId', () => {
  it('finds the package of a pnpm path, with a scope, and without a query', () => {
    expect(packageOfId('/r/node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.js')).toEqual({
      name: 'yaml',
      dir: '/r/node_modules/.pnpm/yaml@2.9.1/node_modules/yaml',
    });
    expect(packageOfId('/r/node_modules/.pnpm/@mujoco+mujoco@4.0.1/node_modules/@mujoco/mujoco/mujoco.wasm?url')).toEqual({
      name: '@mujoco/mujoco',
      dir: '/r/node_modules/.pnpm/@mujoco+mujoco@4.0.1/node_modules/@mujoco/mujoco',
    });
    expect(packageOfId('../node_modules/.pnpm/sql.js@1.16.0/node_modules/sql.js/dist/sql-wasm.wasm')?.name).toBe('sql.js');
  });

  it('gives null for first-party code and virtual modules', () => {
    expect(packageOfId('/r/worlds/ghost-cloud/src/index.ts')).toBeNull();
    expect(packageOfId('\0vite/preload-helper.js')).toBeNull();
    expect(packageOfId('/r/site/src/App.tsx')).toBeNull();
  });

  it('reads the modules of chunks and the original file names of assets', () => {
    const ids = idsOfBundle({
      'a.js': { type: 'chunk', modules: { '/r/node_modules/x/index.js': {}, '/r/site/src/a.ts': {} } },
      'b.woff2': { type: 'asset', originalFileNames: ['../node_modules/f/files/b.woff2'] },
      'c.css': { type: 'asset' },
    });
    expect(ids).toEqual(['/r/node_modules/x/index.js', '/r/site/src/a.ts', '../node_modules/f/files/b.woff2']);
  });
});

describe('renderNotices', () => {
  function repo(): string {
    const root = tmp();
    put(root, 'apps/ghost-hand/notices/sources.json', JSON.stringify({
      components: [
        { id: 'mujoco', name: 'MuJoCo', version: '4.0.1', spdx: 'Apache-2.0', bundledIn: 'mujoco.wasm', file: 'mujoco.LICENSE.txt', upstream: 'https://upstream.example/mujoco' },
        { id: 'qhull', name: 'Qhull', version: 'git abc', spdx: 'Qhull', bundledIn: 'mujoco.wasm', file: 'qhull.LICENSE.txt', upstream: 'https://upstream.example/qhull', sourceNotice: 'Source: https://upstream.example/qhull' },
        { id: 'react', name: 'react', version: '19', spdx: 'MIT', bundledIn: 'JavaScript bundle', file: 'react.LICENSE.txt', upstream: 'https://upstream.example/react' },
      ],
    }));
    put(root, 'apps/ghost-hand/notices/mujoco.LICENSE.txt', 'Apache License of MuJoCo\n');
    put(root, 'apps/ghost-hand/notices/qhull.LICENSE.txt', 'Qhull license text\n');
    put(root, 'apps/ghost-hand/notices/react.LICENSE.txt', 'react from the Ghost Hand folder\n');
    put(root, 'node_modules/sql.js/package.json', '{"name":"sql.js","version":"1.16.0","license":"MIT"}');
    put(root, 'node_modules/sql.js/LICENSE', 'MIT License of sql.js\n');
    put(root, 'node_modules/yaml/package.json', '{"name":"yaml","version":"2.9.1","license":"ISC"}');
    put(root, 'node_modules/yaml/LICENSE', 'ISC License of yaml\n');
    put(root, 'node_modules/@mujoco/mujoco/package.json', '{"name":"@mujoco/mujoco","version":"4.0.1","license":"Apache-2.0"}');
    return root;
  }
  const packages: Pkg[] = [
    { name: '@mujoco/mujoco', version: '4.0.1', license: 'Apache-2.0', dir: 'node_modules/@mujoco/mujoco' },
    { name: 'sql.js', version: '1.16.0', license: 'MIT', dir: 'node_modules/sql.js' },
    { name: 'yaml', version: '2.9.1', license: 'ISC', dir: 'node_modules/yaml' },
  ];

  it('writes a section with the installed license text for every bundled package, and keeps the MuJoCo components', () => {
    const text = renderNotices({ root: repo(), packages });
    for (const p of packages) expect(text.split('\n')).toContain(`${p.name} ${p.version}`);
    expect(text).toContain('MIT License of sql.js');
    expect(text).toContain('ISC License of yaml');
    // @mujoco/mujoco ships no license file: its section takes the MuJoCo text of the Ghost Hand notices folder.
    expect(text).toContain('Apache License of MuJoCo');
    expect(text).toContain('Qhull license text');
    expect(text).toContain('Source: https://upstream.example/qhull');
    // The JavaScript components of the Ghost Hand folder are not copied: the packages are read from node_modules.
    expect(text).not.toContain('react from the Ghost Hand folder');
    expect(missingFromNotices(text, packages)).toEqual([]);
  });

  it('fails when a package has no license text, and when the list is empty', () => {
    const root = repo();
    expect(() => renderNotices({ root, packages: [{ name: 'nolicense', version: '1.0.0', license: 'MIT', dir: 'node_modules/yaml/missing' }] })).toThrow(
      /no license text for nolicense 1\.0\.0/,
    );
    expect(() => renderNotices({ root, packages: [] })).toThrow(/empty/);
  });
});

describe('missingFromNotices', () => {
  const text = ['intro', '', '='.repeat(72), 'yaml 2.9.1', 'License: ISC', '='.repeat(72), '', 'ISC text', '', '='.repeat(72), 'sql.js 1.16.0', 'License: MIT', '='.repeat(72), '', ''].join('\n');
  it('lists a package whose heading is missing, or whose text is empty', () => {
    expect(missingFromNotices(text, [{ name: 'yaml', version: '2.9.1' }])).toEqual([]);
    expect(missingFromNotices(text, [{ name: 'yaml', version: '2.9.0' }])).toEqual([{ name: 'yaml', version: '2.9.0' }]);
    expect(missingFromNotices(text, [{ name: 'react', version: '19.3.1' }])).toHaveLength(1);
    expect(missingFromNotices(text, [{ name: 'sql.js', version: '1.16.0' }])).toHaveLength(1);
  });
});

describe('the site check', () => {
  const heading = (name: string, version: string) => `${'='.repeat(72)}\n${name} ${version}\nLicense: MIT\n${'='.repeat(72)}\n\nlicense text\n`;

  function dist(notice: string): string {
    const root = tmp();
    put(root, 'THIRD_PARTY_NOTICES.txt', notice);
    return root;
  }
  const opts = (list: { name: string; version: string }[]) => ({ structure: false, bundledPackages: list });

  it('passes when every bundled package has a section', () => {
    const root = dist(`${heading('sql.js', '1.16.0')}\n${heading('yaml', '2.9.1')}`);
    expect(checkSite(root, opts([{ name: 'sql.js', version: '1.16.0' }, { name: 'yaml', version: '2.9.1' }]))).toEqual([]);
  });

  it('fails for a bundled package that is missing from the notices file, naming it', () => {
    const root = dist(heading('yaml', '2.9.1'));
    const findings = checkSite(root, opts([{ name: 'sql.js', version: '1.16.0' }, { name: 'yaml', version: '2.9.1' }]));
    expect(findings).toEqual([{ file: 'THIRD_PARTY_NOTICES.txt', reference: 'sql.js 1.16.0', rule: RULE_NOTICE_PACKAGE }]);
  });

  it('fails for a package that is listed with another version', () => {
    const root = dist(heading('yaml', '2.9.0'));
    expect(checkSite(root, opts([{ name: 'yaml', version: '2.9.1' }])).map((f) => f.rule)).toEqual([RULE_NOTICE_PACKAGE]);
  });

  it('fails when the list of bundled packages is missing or empty', () => {
    const root = dist(heading('yaml', '2.9.1'));
    expect(checkSite(root, { structure: false, bundledPackages: path.join(root, 'nope.json') }).map((f) => f.rule)).toEqual([RULE_NOTICE_LIST]);
    expect(checkSite(root, opts([])).map((f) => f.rule)).toEqual([RULE_NOTICE_LIST]);
  });

  it('does not look at the notices when no list is given', () => {
    expect(checkSite(dist('anything'), { structure: false })).toEqual([]);
  });
});
