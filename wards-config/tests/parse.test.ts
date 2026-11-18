import { describe, expect, it } from 'vitest';
import { parseWards } from '../src/parse.js';
import type { ConfigErrorCode } from '../src/types.js';

const PATH_WARD = [
  'wards:',
  '  - id: protect-env',
  '    kind: path',
  '    deny: [delete, overwrite]',
  '    paths: [".env", "data/**"]',
  '',
].join('\n');

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

describe('parseWards: valid documents', () => {
  it('parses all four kinds in document order and leaves absent optionals absent', () => {
    const text = [
      'wards:',
      '  - id: a',
      '    kind: path',
      '    deny: [delete]',
      '    paths: [".env"]',
      '  - id: b',
      '    kind: sql',
      '    tables: [users]',
      '    max_rows_lost: 0',
      '  - id: c',
      '    kind: egress',
      '    secrets: [".env"]',
      '    allow_hosts: []',
      '  - id: d',
      '    kind: physics',
      '    min_success_rate: 0.5',
      '    max_contact_force_n: 20',
      '    forbidden_contacts: [table]',
      '',
    ].join('\n');
    const r = parseWards(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wardSet.wards.map((w) => w.id)).toEqual(['a', 'b', 'c', 'd']);
    expect('case_sensitive' in r.wardSet.wards[0]!).toBe(false);
    expect(r.safeCommands).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('warns on an empty ward set and on a catch-all pattern', () => {
    const empty = parseWards('wards: []\n');
    expect(empty.ok && empty.warnings.map((w) => w.code)).toEqual(['empty-ward-set']);
    const all = parseWards(PATH_WARD.replace('".env", "data/**"', '"**"'));
    expect(all.ok && all.warnings.map((w) => w.code)).toEqual(['catch-all-pattern']);
  });

  it('never throws and handles empty input', () => {
    expect(parseWards('').ok).toBe(false);
    expect(() => parseWards('\u0000: [')).not.toThrow();
  });
});

describe('parseWards: error codes', () => {
  it('yaml-syntax-error', () => {
    expectError('wards: [\n', 'yaml-syntax-error', 2);
  });
  it('yaml-feature-unsupported: anchor, alias, tag, merge key, depth, pre-scan', () => {
    expectError('wards: []\nx: &a 1\n', 'yaml-feature-unsupported', 2);
    expectError('wards: []\nx: *a\n', 'yaml-feature-unsupported', 2);
    expectError('wards: !!seq []\n', 'yaml-feature-unsupported', 1);
    expectError('wards: []\n<<: {}\n', 'yaml-feature-unsupported', 2);
    expectError(`wards: ${'['.repeat(9)}${']'.repeat(9)}\n`, 'yaml-feature-unsupported', 1);
    expectError(`wards: ${'['.repeat(65)}\n`, 'yaml-feature-unsupported', 1);
    expectError(`wards:\n${' '.repeat(70)}- x\n`, 'yaml-feature-unsupported', 2);
  });
  it('duplicate-key names the first line', () => {
    const e = expectError('wards: []\nwards: []\n', 'duplicate-key', 2);
    expect(e?.message).toContain('line 1');
  });
  it('input-too-large', () => {
    const e = errorsOf('#'.repeat(262_145));
    expect(e[0]?.code).toBe('input-too-large');
    expect(parseWards('wards: []\n#' + 'x'.repeat(100_000)).ok).toBe(true);
  });
  it('root-not-mapping, unknown-root-field, wards-not-sequence', () => {
    expectError('- a\n', 'root-not-mapping', 1);
    expectError('wards: []\nextra: 1\n', 'unknown-root-field', 2);
    expectError('wards: 3\n', 'wards-not-sequence', 1);
    expectError('safe_commands: []\n', 'wards-not-sequence', 1);
  });
  it('unknown-kind, missing-field, unknown-field, duplicate-id', () => {
    expectError('wards:\n  - id: a\n    kind: nope\n', 'unknown-kind', 2);
    expectError('wards:\n  - id: a\n    kind: sql\n    tables: [t]\n', 'missing-field', 2);
    expectError(PATH_WARD + '    extra: 1\n', 'unknown-field', 6);
    const dup = PATH_WARD + PATH_WARD.split('\n').slice(1).join('\n');
    const e = expectError(dup, 'duplicate-id', 6);
    expect(e?.message).toContain('line 2');
    expect(e?.wardId).toBe('protect-env');
  });
  it('wrong-type and out-of-range', () => {
    const sql = (v: string) => `wards:\n  - id: a\n    kind: sql\n    tables: [t]\n    max_rows_lost: ${v}\n`;
    expectError(sql('"0"'), 'wrong-type', 5);
    expectError(sql('-1'), 'out-of-range', 5);
    expectError(sql('1.5'), 'out-of-range', 5);
    const phys = `wards:\n  - id: a\n    kind: physics\n    min_success_rate: 1.5\n    max_contact_force_n: 1\n    forbidden_contacts: []\n`;
    expectError(phys, 'out-of-range', 4);
    expectError('wards:\n  - id: A\n    kind: sql\n', 'out-of-range', 2);
    expectError(PATH_WARD.replace('[delete, overwrite]', '[]'), 'out-of-range', 4);
  });
  it('invalid-glob and invalid-host carry detail', () => {
    const g = expectError(PATH_WARD.replace('".env"', '"/abs"'), 'invalid-glob', 5);
    expect(g?.detail).toBe('absolute-pattern');
    expect(g?.field).toBe('paths[0]');
    const h = expectError(
      'wards:\n  - id: e\n    kind: egress\n    secrets: [".env"]\n    allow_hosts: ["http://x.example"]\n',
      'invalid-host',
      5,
    );
    expect(h?.detail).toBe('scheme-not-allowed');
  });
  it('invalid-character', () => {
    expectError(PATH_WARD.replace('".env"', '"a\\u200Bb"'), 'invalid-character', 5);
  });
  it('duplicate-entry after normalization', () => {
    expectError(PATH_WARD.replace('".env", "data/**"', '".env", "./.env"'), 'duplicate-entry', 5);
  });
  it('sorts errors and caps at 50 with too-many-errors', () => {
    const wards = Array.from({ length: 60 }, (_, i) => `  - id: w${i}\n    kind: nope\n`).join('');
    const errs = errorsOf('wards:\n' + wards);
    expect(errs).toHaveLength(51);
    expect(errs[50]?.code).toBe('too-many-errors');
    expect(errs[0]?.line).toBe(2);
  });
  it('never puts entry text into messages beyond the truncated glob entry', () => {
    const e = errorsOf(PATH_WARD.replace('".env"', '"/' + 'z'.repeat(200) + '"'))[0]!;
    expect(e.message).not.toContain('z'.repeat(81));
  });
});

describe('parseWards: safe_commands', () => {
  const doc = (list: string) => `wards: []\nsafe_commands:\n${list}`;

  it('parses a valid list in document order', () => {
    const r = parseWards(doc('  - ls\n  - git status\n  - npm run test\n'));
    expect(r.ok && r.safeCommands).toEqual(['ls', 'git status', 'npm run test']);
  });
  it('wrong-type for a non-list value and a non-string item', () => {
    expectError('wards: []\nsafe_commands:\n', 'wrong-type', 2);
    expectError('wards: []\nsafe_commands: ls\n', 'wrong-type', 2);
    expectError(doc('  - ls\n  - 3\n'), 'wrong-type', 4);
  });
  it('invalid-character for tab and hidden characters', () => {
    expectError(doc('  - "a\\tb"\n'), 'invalid-character', 3);
    expectError(doc('  - "a\\u202Eb"\n'), 'invalid-character', 3);
  });
  it('out-of-range for empty, over-long, and too many entries', () => {
    expectError(doc('  - ""\n'), 'out-of-range', 3);
    expectError(doc(`  - ${'a'.repeat(257)}\n`), 'out-of-range', 3);
    const many = Array.from({ length: 257 }, (_, i) => `  - c${i}\n`).join('');
    const e = errorsOf(doc(many)).filter((x) => x.code === 'out-of-range');
    expect(e).toHaveLength(1);
    expect(e[0]?.line).toBe(3); // a block list value starts at its first item
  });
  it('unsafe-command-entry with detail charset or spacing', () => {
    for (const bad of ['ls; rm', 'a | b', '$(x)', '"a b\\u00e9"']) {
      const e = expectError(doc(`  - ${bad.startsWith('"') ? bad : JSON.stringify(bad)}\n`), 'unsafe-command-entry', 3);
      expect(e?.detail).toBe('charset');
    }
    for (const bad of ['"a  b"', '" a"', '"a "']) {
      const e = expectError(doc(`  - ${bad}\n`), 'unsafe-command-entry', 3);
      expect(e?.detail).toBe('spacing');
    }
  });
  it('duplicate-entry names the first line and no message carries the entry', () => {
    const e = expectError(doc('  - ls\n  - git status\n  - ls\n'), 'duplicate-entry', 5);
    expect(e?.message).toContain('line 3');
    expect(e?.field).toBe('safe_commands[2]');
    expect(e?.message).not.toContain('ls\n');
    const bad = errorsOf(doc('  - "secret;x"\n'))[0]!;
    expect(bad.message).not.toContain('secret');
  });
  it('a repeated safe_commands key is duplicate-key', () => {
    expectError('wards: []\nsafe_commands: []\nsafe_commands: []\n', 'duplicate-key', 3);
  });
  it('error result has no safeCommands or wardSet', () => {
    const r = parseWards(doc('  - ls;\n'));
    expect(r.ok).toBe(false);
    expect('safeCommands' in r).toBe(false);
    expect('wardSet' in r).toBe(false);
  });
});
