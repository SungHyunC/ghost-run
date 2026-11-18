import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Validates: Requirements 8.2, 8.12, 18.6 [no-docker]
// The box CA key is generated inside the image at build time. No private key may be in the repository.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Built from parts so this file does not contain a PEM private-key header itself.
const DASHES = '-'.repeat(5);
const HEADERS = ['', 'RSA ', 'EC ', 'DSA ', 'OPENSSH ', 'ENCRYPTED '].map((k) => `${DASHES}BEGIN ${k}PRIVATE KEY${DASHES}`);

const NAME_PATTERNS: readonly RegExp[] = [/\.key$/i, /\.p12$/i, /\.pfx$/i, /^id_rsa/i, /^ca-key/i];
const SKIP_DIRS = new Set(['node_modules', '.git']);
const MAX_SCAN_BYTES = 4 * 1024 * 1024;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

const files = walk(repoRoot);

describe('no private key material in the repository', () => {
  it('scans a non-trivial number of files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('contains no private-key PEM header in any file', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (lstatSync(f).size > MAX_SCAN_BYTES) continue;
      const buf = readFileSync(f);
      if (HEADERS.some((h) => buf.includes(h))) offenders.push(relative(repoRoot, f));
    }
    expect(offenders).toEqual([]);
  });

  it('has no file whose name looks like a key file', () => {
    const offenders = files
      .map((f) => relative(repoRoot, f))
      .filter((rel) => NAME_PATTERNS.some((re) => re.test(rel.split('/').pop() ?? '')));
    expect(offenders).toEqual([]);
  });

  it('keeps the key-material entries in .gitignore', () => {
    const lines = new Set(
      readFileSync(join(repoRoot, '.gitignore'), 'utf8')
        .split('\n')
        .map((l) => l.trim()),
    );
    for (const entry of [
      'ghost-runner/dist',
      '.ghost-run-*/',
      'ghost-runner/box/*.local',
      '*.key',
      '*.pem',
      '*.p12',
      '*.pfx',
      'id_rsa*',
      'box/ca/',
      '**/ghost/ca/',
    ]) {
      expect(lines.has(entry), `.gitignore entry ${entry}`).toBe(true);
    }
    expect(lines.has('.kiro/') || lines.has('.kiro')).toBe(false);
  });

  it('never copies key material into the image build', () => {
    const dockerfile = readFileSync(join(repoRoot, 'ghost-runner', 'box', 'Dockerfile'), 'utf8');
    const copies = dockerfile.split('\n').filter((l) => /^\s*(COPY|ADD)\b/i.test(l));
    expect(copies.filter((l) => /\.(key|pem|p12|pfx)\b|\bca\b/i.test(l))).toEqual([]);
    expect(dockerfile).toContain('NODE_EXTRA_CA_CERTS=/opt/ghost/ca/ca.crt');
  });
});
