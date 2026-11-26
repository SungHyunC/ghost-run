import { describe, expect, it } from 'vitest';
import { parseWards } from '../src/parse.js';
import type { ConfigErrorCode } from '../src/types.js';

const doc = (list: string) => `wards: []\ntrusted_commands:\n${list}`;

function errorsOf(text: string) {
  const r = parseWards(text);
  if (r.ok) throw new Error('expected errors');
  return r.errors;
}

function expectError(text: string, code: ConfigErrorCode, line: number) {
  const errs = errorsOf(text);
  const hit = errs.find((e) => e.code === code);
  expect(hit, JSON.stringify(errs)).toBeDefined();
  expect(hit?.line).toBe(line);
  return hit;
}

describe('parseWards: trusted_commands', () => {
  it('is [] when the key is absent', () => {
    const r = parseWards('wards: []\n');
    expect(r.ok && r.trustedCommands).toEqual([]);
  });

  it('parses patterns in document order, with * and a final **', () => {
    const r = parseWards(doc('  - corepack pnpm test\n  - "corepack pnpm --filter * test"\n  - "npx vitest run **"\n'));
    expect(r.ok && r.trustedCommands).toEqual([
      'corepack pnpm test',
      'corepack pnpm --filter * test',
      'npx vitest run **',
    ]);
    expect(r.ok && r.warnings.filter((w) => w.code === 'catch-all-pattern')).toEqual([]);
  });

  it('is independent of safe_commands', () => {
    const r = parseWards('wards: []\nsafe_commands: [ls]\ntrusted_commands: [make]\n');
    expect(r.ok && r.safeCommands).toEqual(['ls']);
    expect(r.ok && r.trustedCommands).toEqual(['make']);
  });

  it('wrong-type for a non-list value and a non-string item', () => {
    expectError('wards: []\ntrusted_commands:\n', 'wrong-type', 2);
    expectError('wards: []\ntrusted_commands: make\n', 'wrong-type', 2);
    expectError(doc('  - make\n  - 3\n'), 'wrong-type', 4);
  });

  it('invalid-character for tab and hidden characters', () => {
    expectError(doc('  - "a\\tb"\n'), 'invalid-character', 3);
    expectError(doc('  - "a\\u202Eb"\n'), 'invalid-character', 3);
  });

  it('out-of-range for an empty entry, an over-long entry, and too many entries', () => {
    expectError(doc('  - ""\n'), 'out-of-range', 3);
    expectError(doc(`  - ${'a'.repeat(257)}\n`), 'out-of-range', 3);
    const many = Array.from({ length: 257 }, (_, i) => `  - c${i}\n`).join('');
    const e = errorsOf(doc(many)).filter((x) => x.code === 'out-of-range');
    expect(e).toHaveLength(1);
    expect(e[0]?.line).toBe(3);
  });

  it('accepts exactly 256 entries of exactly 256 characters', () => {
    const items = Array.from({ length: 256 }, (_, i) => `${String(i).padStart(3, '0')}${'a'.repeat(253)}`);
    expect(items.every((s) => s.length === 256)).toBe(true);
    const r = parseWards(`wards: []\ntrusted_commands: [${items.join(', ')}]\n`);
    expect(r.ok && r.trustedCommands).toHaveLength(256);
  });

  it('unsafe-command-entry with detail charset for shell operators and quotes', () => {
    for (const bad of ['make; rm', 'a | b', 'a && b', '$(x)', 'a > b', 'a `b`', "a 'b'", 'a\\\\b', '(x)', 'a{b}']) {
      const e = expectError(doc(`  - ${JSON.stringify(bad)}\n`), 'unsafe-command-entry', 3);
      expect(e?.detail, bad).toBe('charset');
    }
  });

  it('unsafe-command-entry with detail spacing', () => {
    for (const bad of ['"a  b"', '" a"', '"a "']) {
      const e = expectError(doc(`  - ${bad}\n`), 'unsafe-command-entry', 3);
      expect(e?.detail).toBe('spacing');
    }
  });

  it('unsafe-command-entry with detail wildcard for a * inside a word or ** before the end', () => {
    for (const bad of ['"a* b"', '"** a"', '"a ** b"', '"a ***"', '"a *x"']) {
      const r = parseWards(doc(`  - ${bad}\n`));
      expect(r.ok, bad).toBe(false);
      if (r.ok) continue;
      const e = r.errors.find((x) => x.code === 'unsafe-command-entry');
      expect(e?.detail, bad).toBe('wildcard');
    }
  });

  it('duplicate-entry names the first line and the message carries no entry text', () => {
    const e = expectError(doc('  - make\n  - build\n  - make\n'), 'duplicate-entry', 5);
    expect(e?.message).toContain('line 3');
    expect(e?.field).toBe('trusted_commands[2]');
    const bad = errorsOf(doc('  - "secret;x"\n'))[0]!;
    expect(bad.message).not.toContain('secret');
    expect(bad.field).toBe('trusted_commands[0]');
  });

  it('a repeated trusted_commands key is duplicate-key', () => {
    expectError('wards: []\ntrusted_commands: []\ntrusted_commands: []\n', 'duplicate-key', 3);
  });

  it('warns catch-all-pattern for a pattern that starts with a wildcard', () => {
    const r = parseWards(doc('  - "* test"\n'));
    expect(r.ok && r.warnings.filter((w) => w.code === 'catch-all-pattern').map((w) => w.line)).toEqual([3]);
  });

  it('error result has no trustedCommands', () => {
    const r = parseWards(doc('  - make;\n'));
    expect(r.ok).toBe(false);
    expect('trustedCommands' in r).toBe(false);
  });
});
