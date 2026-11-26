// Task 11.8: repository hygiene. Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6.
// This file is ASCII only. No hidden character and no HTML comment opener appears literally.
//
// Enumeration approach: only the listed folders are walked, and node_modules and dist are
// skipped. For the specs and steering folders (and the root README) the candidate list is
// also filtered through `git check-ignore --stdin`, so anything .gitignore ignores is never
// scanned.

import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanFiles } from '../possession-node.js';

const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(coreDir, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist']);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Drops paths that .gitignore ignores. `git check-ignore` exits 1 when none are ignored. */
function dropGitIgnored(paths: string[]): string[] {
  if (paths.length === 0) return paths;
  const result = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
    cwd: repoRoot,
    input: paths.map((p) => relative(repoRoot, p)).join('\0') + '\0',
    encoding: 'utf8',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore failed: ${result.stderr}`);
  }
  const ignored = new Set(result.stdout.split('\0').filter((s) => s !== ''));
  return paths.filter((p) => !ignored.has(relative(repoRoot, p)));
}

function describeFindings(report: Awaited<ReturnType<typeof scanFiles>>): string[] {
  const lines: string[] = [];
  for (const file of report.files) {
    if (file.error !== undefined) lines.push(`${file.path}: ${file.error}`);
    for (const f of file.findings) {
      lines.push(`${file.path}:${f.line}:${f.column} ${f.category} ${f.firstCodePoint}`);
    }
  }
  return lines;
}

async function nonAsciiProblems(path: string): Promise<string[]> {
  const text = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(
    await readFile(path),
  );
  const problems: string[] = [];
  let line = 1;
  let column = 1;
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp === 0x0a) {
      line += 1;
      column = 1;
      continue;
    }
    if (cp !== 0x09 && (cp < 0x20 || cp > 0x7e)) {
      problems.push(`${path}:${line}:${column} U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    }
    column += 1;
  }
  return problems;
}

async function featureSourceFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const dir of ['src/possession', 'tests/possession', 'tests-node']) {
    files.push(...(await walk(join(coreDir, dir))));
  }
  for (const file of [
    'possession-node.ts',
    'scripts/gen-emoji-table.mjs',
    'tests/possession-types.test-d.ts',
  ]) {
    files.push(join(coreDir, file));
  }
  // Both generated tables live in src/possession/; list them explicitly so a rename fails loudly.
  files.push(
    join(coreDir, 'src/possession/emoji-table.generated.ts'),
    join(coreDir, 'src/possession/tag-sequence-table.generated.ts'),
  );
  return [...new Set(files)];
}

describe('repository hygiene', () => {
  it('specs, steering, root README and the documents moved out of it are clean', async () => {
    // The sections of the root README that moved to docs/ keep the same hygiene rule.
    const movedDocs = [
      'build-a-world', 'built-with-kiro', 'dependencies', 'ghost-hand', 'ghost-runner', 'ghost-shell', 'how-it-works',
      'kiro-integration', 'landing-site', 'possession', 'quick-start', 'ui-kit', 'wards',
    ].map((name) => join(repoRoot, 'docs', `${name}.md`));
    const candidates = [
      ...(await walk(join(repoRoot, '.kiro/specs/possession'))),
      ...(await walk(join(repoRoot, '.kiro/steering'))),
      join(repoRoot, 'README.md'),
      ...movedDocs,
    ];
    const files = dropGitIgnored(candidates);
    expect(files.length).toBeGreaterThan(0);
    const report = await scanFiles(files);
    expect(describeFindings(report)).toEqual([]);
    expect(report.outcome).toBe('clean');
  });

  it('feature sources are clean under the markdown rule and plain ASCII', async () => {
    const files = await featureSourceFiles();
    expect(files.length).toBeGreaterThan(20);
    const report = await scanFiles(files, { markdown: true });
    expect(describeFindings(report)).toEqual([]);
    expect(report.totalFindings).toBe(0);
    const problems: string[] = [];
    for (const file of files) problems.push(...(await nonAsciiProblems(file)));
    expect(problems).toEqual([]);
  });

  it('URL hosts in feature sources are reserved (or a known public data source)', async () => {
    const reservedTld = /\.(example|test|localhost|invalid)$/;
    const allowedHosts = new Set([
      'example.com',
      'www.unicode.org',
      'unicode.org',
      'localhost',
    ]);
    const bad: string[] = [];
    const urlPattern = /\bhttps?:\/\/([A-Za-z0-9.-]+)/g;
    for (const file of await featureSourceFiles()) {
      const text = await readFile(file, 'utf8');
      for (const match of text.matchAll(urlPattern)) {
        const host = (match[1] as string).toLowerCase().replace(/\.$/, '');
        if (!reservedTld.test(host) && !allowedHosts.has(host)) {
          bad.push(`${relative(repoRoot, file)}: ${host}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
