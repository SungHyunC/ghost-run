// Repository hygiene tests (task 16.1). Reads the repository; writes nothing.
// Hidden characters and the HTML comment opener are built from code points here, never written literally.
// **Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 2.1**
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReport } from '@ghost-run/core';
import { scanFiles } from '@ghost-run/core/possession-node';
import { describe, expect, it } from 'vitest';
import { diffSnapshots } from './global-hygiene.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.ghost-run']);

/** The folders of this feature that the possession scan covers (Requirement 22 criterion 2). */
const SCAN_ROOTS = ['integrations', '.kiro/hooks', '.kiro/specs/kiro-integration'];
/** The new-world template is part of this feature (task: _new-world). It is added when it exists. */
const TEMPLATE_ROOT = '.kiro/specs/_new-world';

const FIVE_HOOKS = ['ghost-gate', 'ghost-log', 'contract-pbt', 'world-scaffold', 'blacklight-steering'];

// Retired experiment code kept unchanged (task 3.1) and a generated third-party bundle.
const NON_ASCII_EXEMPT = new Set(['integrations/kiro-hook/exp-b-gate.mjs']);

/** Documentation or schema identifiers that appear as text. They are never request targets. */
const DOC_HOSTS = new Set(['kiro.dev', 'agent-plugins.org']);
const RESERVED_SUFFIXES = ['.example', '.test', '.localhost', '.invalid'];

/** @param {string} rel @returns {string[]} repository-relative file paths, sorted */
function walk(rel) {
  const abs = join(REPO, rel);
  if (!existsSync(abs)) return [];
  /** @type {string[]} */
  const out = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) out.push(...walk(child));
    } else if (e.isFile()) {
      out.push(child);
    }
  }
  return out.sort();
}

const featureRoots = [...SCAN_ROOTS, ...(existsSync(join(REPO, TEMPLATE_ROOT)) ? [TEMPLATE_ROOT] : [])];
const featureFiles = featureRoots.flatMap(walk);
/** Fixtures, tests, and documents of this feature (Requirement 22 criterion 3). */
const docAndTestFiles = featureFiles.filter(
  (f) =>
    /^integrations\/[^/]+\/tests\//.test(f) ||
    /^integrations\/[^/]+\/docs\//.test(f) ||
    /^integrations\/[^/]+\/README\.md$/.test(f) ||
    /^integrations\/power\/(README\.md|skills\/)/.test(f) ||
    f.startsWith('.kiro/specs/'),
);
/** @param {string} rel */
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

const HIDDEN_RE = new RegExp(
  '[\\u200B-\\u200D\\u2060\\uFEFF\\u202A-\\u202E\\u2066-\\u2069\\u{E0000}-\\u{E007F}]',
  'u',
);
const HTML_COMMENT_OPENER = `<${'!'}--`;

/** @param {string} host */
export function hostAllowed(host) {
  const h = host.toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === 'registry.npmjs.org') return true;
  if (DOC_HOSTS.has(h)) return true;
  if (RESERVED_SUFFIXES.some((s) => h.endsWith(s))) return true;
  return /^192\.0\.2\.\d{1,3}$/.test(h);
}

/**
 * Hosts named in a text: URL authorities and the domain part of e-mail-like tokens.
 * @param {string} text @returns {string[]}
 */
export function hostsIn(text) {
  /** @type {string[]} */
  const hosts = [];
  for (const m of text.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/([^/\s"'`)>\\<,;?#]+)/gi)) {
    const authority = m[1];
    hosts.push(authority.slice(authority.lastIndexOf('@') + 1));
  }
  for (const m of text.matchAll(/\b[\w.+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g)) hosts.push(m[1]);
  return [...new Set(hosts)];
}

/**
 * Secret-like tokens that are not canaries.
 * @param {string} text @returns {string[]}
 */
export function nonCanarySecrets(text) {
  /** @type {string[]} */
  const found = [];
  for (const m of text.matchAll(/\bsk-[A-Za-z0-9_-]{8,}/g)) if (!/CANARY/i.test(m[0])) found.push(m[0].slice(0, 8));
  for (const m of text.matchAll(/\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,})/g)) found.push(m[0].slice(0, 6));
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) found.push('private-key');
  return found;
}

describe('possession scan of the feature (Requirement 22 criterion 2)', () => {
  it('returns clean for integrations/, .kiro/hooks/, and the kiro-integration spec', async () => {
    const files = featureFiles.map((f) => join(REPO, f));
    const report = await scanFiles(files, { markdown: 'by-extension' });
    expect(report.files.length).toBe(files.length);
    expect(report.outcome, formatReport(report)).toBe('clean');
  }, 60_000);
});

describe('hook files (Requirement 2 criterion 1)', () => {
  for (const name of FIVE_HOOKS) {
    it(`${name}.json exists and holds a hook list with an explicit enabled field`, () => {
      const file = join(REPO, '.kiro', 'hooks', `${name}.json`);
      expect(existsSync(file), `${name}.json is missing`).toBe(true);
      const doc = JSON.parse(readFileSync(file, 'utf8'));
      expect(Array.isArray(doc.hooks) && doc.hooks.length > 0).toBe(true);
      for (const h of doc.hooks) expect(typeof h.enabled).toBe('boolean');
    });
  }
  // The format of every file in the folder (triggers, matchers, timeout placement, command form)
  // is checked by tests/hook-files.test.mjs.
});

describe('hosts and secrets in fixtures, tests, and documents (Requirement 22 criterion 3)', () => {
  it('names only reserved domains, registry.npmjs.org, 192.0.2.x, or a documentation identifier', () => {
    const bad = docAndTestFiles.flatMap((f) =>
      hostsIn(read(f))
        .filter((h) => !hostAllowed(h))
        .map((h) => `${f}: ${h}`),
    );
    expect(bad).toEqual([]);
  });

  it('holds only canary values as secrets', () => {
    const bad = docAndTestFiles.flatMap((f) => nonCanarySecrets(read(f)).map((s) => `${f}: ${s}`));
    expect(bad).toEqual([]);
  });

  it('holds no real user name, home path, or e-mail address', () => {
    const names = [userInfo().username, homedir()].filter((n) => n.length > 3 && n !== '/');
    const bad = featureFiles
      .filter((f) => !/\/dist\//.test(f))
      .flatMap((f) => {
        const text = read(f).toLowerCase();
        return names.filter((n) => text.includes(n.toLowerCase())).map(() => `${f}: contains the local user name or home path`);
      });
    expect(bad).toEqual([]);
  });

  it('the host and secret checks fire on violating text', () => {
    // The violating samples are built from parts so that this file does not scan as a violation.
    const real = ['evil', 'com'].join('.');
    const mail = `a@${['b', 'org'].join('.')}`;
    const sep = [':', '//'].join('');
    const loopback = `http${sep}[${':'.repeat(2)}1]:8080/`;
    expect(hostsIn(`see https${sep}u:p@docs.example/x and http${sep}${real}/y and ${mail}`).sort()).toEqual(
      [...new Set(['docs.example', real, 'b.org'])].sort(),
    );
    expect(hostsIn(loopback)).toEqual([`[${':'.repeat(2)}1]:8080`]);
    expect(hostAllowed('docs.example') && hostAllowed('192.0.2.7') && hostAllowed('localhost:5317')).toBe(true);
    expect(hostAllowed(real) || hostAllowed('192.0.3.1') || hostAllowed('example.com')).toBe(false);
    const key = `${'sk'}-${'abcdefghij12'}`;
    expect(nonCanarySecrets(`${key} and sk-CANARY-abc123`)).toEqual(['sk-abcde']);
  });
});

describe('hidden characters and the HTML comment opener (Requirement 22 criteria 1 and 4)', () => {
  it('no file of the feature holds a literal hidden character or the opener', () => {
    const bad = featureFiles.flatMap((f) => {
      const text = read(f);
      const found = [];
      if (HIDDEN_RE.test(text)) found.push(`${f}: hidden character`);
      if (text.includes(HTML_COMMENT_OPENER)) found.push(`${f}: HTML comment opener`);
      return found;
    });
    expect(bad).toEqual([]);
  });

  it('the pattern itself fires on built strings', () => {
    for (const cp of [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202a, 0x202e, 0x2066, 0x2069, 0xe0041]) {
      expect(HIDDEN_RE.test(`a${String.fromCodePoint(cp)}b`)).toBe(true);
    }
    expect(HIDDEN_RE.test('plain text with Hangul \uD55C and emoji')).toBe(false);
  });
});

describe('English ASCII text (Requirement 22 criterion 6)', () => {
  it('every file of the feature is ASCII, except the retired exp-b-gate.mjs', () => {
    const bad = featureFiles
      .filter((f) => !NON_ASCII_EXEMPT.has(f))
      .filter((f) => {
        const text = read(f);
        for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 0x7f) return true;
        return false;
      });
    expect(bad).toEqual([]);
  });

  it('the exempt file holds no Hangul or CJK character', () => {
    for (const f of NON_ASCII_EXEMPT) {
      expect(/[\u1100-\u11FF\u3130-\u318F\u3400-\u9FFF\uAC00-\uD7AF]/.test(read(f))).toBe(false);
    }
  });
});

describe('a test run leaves no stray file (Requirement 22 criterion 5)', () => {
  // The check itself runs once per run in tests/global-hygiene.mjs (globalSetup in vitest.config.ts).
  it('is configured as a vitest globalSetup', () => {
    const config = readFileSync(join(REPO, 'integrations', 'kiro-hook', 'vitest.config.ts'), 'utf8');
    expect(config).toContain('tests/global-hygiene.mjs');
  });

  it('the snapshot comparison reports new files and ignores removed ones and the probe folder', () => {
    const before = { ghostStore: ['a'], untracked: ['x.mjs'] };
    expect(diffSnapshots(before, { ghostStore: ['a'], untracked: ['x.mjs'] })).toEqual([]);
    expect(diffSnapshots(before, { ghostStore: ['a', 'runs/r.json'], untracked: ['x.mjs', 'tmp.log'] })).toEqual([
      '.ghost-run/runs/r.json',
      'tmp.log',
    ]);
    expect(diffSnapshots(before, { ghostStore: [], untracked: [] })).toEqual([]);
  });
});
