import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Validates: Requirements 18.6, 18.7 [no-docker]
// Repository scan: no hidden Unicode and no real-credential patterns in ghost-runner/ and the spec folder.
// Every character class is built from \u escapes; no hidden character appears literally in this file.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_ROOTS = ['ghost-runner', join('.kiro', 'specs', 'ghost-runner')];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git', '.vite', '.turbo']);
const MAX_SCAN_BYTES = 4 * 1024 * 1024;

const HIDDEN = new RegExp(
  '[\\u{E0000}-\\u{E007F}\\u200B-\\u200D\\u2060\\uFEFF\\u202A-\\u202E\\u2066-\\u2069]',
  'u',
);
const ZWJ = '\u200D';
const PICTO = /^\p{Extended_Pictographic}$/u;
const EMOJI_MODIFIER = /^[\u{1F3FB}-\u{1F3FF}\uFE0F]$/u;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

const files = SCAN_ROOTS.flatMap((r) => walk(join(repoRoot, r))).filter((f) => lstatSync(f).size <= MAX_SCAN_BYTES);

/** True when the ZWJ at index i of cps joins two emoji (standard ZWJ sequence). */
function isEmojiZwj(cps: string[], i: number): boolean {
  let before = i - 1;
  while (before >= 0 && EMOJI_MODIFIER.test(cps[before] as string)) before--;
  const after = cps[i + 1];
  return before >= 0 && PICTO.test(cps[before] as string) && after !== undefined && PICTO.test(after);
}

function hiddenOffenders(text: string): string[] {
  const cps = Array.from(text);
  const found: string[] = [];
  let line = 1;
  cps.forEach((ch, i) => {
    if (ch === '\n') line++;
    else if (HIDDEN.test(ch) && !(ch === ZWJ && isEmojiZwj(cps, i))) {
      found.push(`line ${line} U+${(ch.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, '0')}`);
    }
  });
  return found;
}

// Real-credential shapes. A value is acceptable only when it is visibly a canary.
const CREDENTIAL_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['sk- style API key', /\bsk-[A-Za-z0-9_-]{20,}/g],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{30,}/g],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['JSON Web Token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
];

function credentialOffenders(text: string): string[] {
  const found: string[] = [];
  for (const [name, re] of CREDENTIAL_PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (/canary/i.test(m[0])) continue;
      found.push(`${name} at offset ${m.index}`);
    }
  }
  return found;
}

describe('repository scan', () => {
  it('scans a non-trivial number of files and skips build output', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => /[\\/](node_modules|dist)[\\/]/.test(relative(repoRoot, f)))).toBe(false);
  });

  it('contains no hidden Unicode (tag, zero-width, bidi) outside emoji ZWJ sequences', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const o of hiddenOffenders(readFileSync(f, 'utf8'))) offenders.push(`${relative(repoRoot, f)}: ${o}`);
    }
    expect(offenders).toEqual([]);
  });

  it('contains no real-credential patterns (canary values only)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const o of credentialOffenders(readFileSync(f, 'utf8'))) offenders.push(`${relative(repoRoot, f)}: ${o}`);
    }
    expect(offenders).toEqual([]);
  });

  describe('detector self-check', () => {
    it('flags each hidden class built from escapes', () => {
      for (const ch of ['\u{E0041}', '\u200B', '\u200C', '\u2060', '\uFEFF', '\u202E', '\u2066', '\u2069']) {
        expect(hiddenOffenders(`a${ch}b`)).toHaveLength(1);
      }
    });

    it('allows ZWJ between emoji and flags it between letters', () => {
      expect(hiddenOffenders('\u{1F468}\u200D\u{1F469}')).toEqual([]);
      expect(hiddenOffenders('\u{1F468}\u{1F3FD}\u200D\u{1F469}')).toEqual([]);
      expect(hiddenOffenders('a\u200Db')).toHaveLength(1);
    });

    it('ignores Hangul, ordinary emoji and combining marks', () => {
      expect(hiddenOffenders('\uD55C\uAE00 \u{1F600} e\u0301')).toEqual([]);
    });

    it('flags real-looking credentials and accepts canaries', () => {
      expect(credentialOffenders(`key=${'sk-'}${'a1B2c3D4e5F6g7H8i9J0'}`)).toHaveLength(1);
      expect(credentialOffenders(`id=${'AKIA'}${'ABCDEFGHIJKLMNOP'}`)).toHaveLength(1);
      expect(credentialOffenders('sk-CANARY-abc123 sk-CANARY-abcdefghijklmnopqrstuvwxyz')).toEqual([]);
    });
  });
});
