import { describe, expect, it } from 'vitest';
import type { WardSet } from '@ghost-run/core';
import { printWards } from '../src/print.js';

const one = (w: WardSet['wards'][number]): WardSet => ({ wards: [w] });

describe('printWards', () => {
  it('prints all four kinds in canonical order', () => {
    const ws: WardSet = {
      wards: [
        { id: 'keep-env', kind: 'path', deny: ['delete', 'overwrite'], paths: ['.env', 'data/**'], case_sensitive: true },
        { id: 'users', kind: 'sql', tables: ['users'], max_rows_lost: 0 },
        { id: 'no-leak', kind: 'egress', secrets: ['.env'], allow_hosts: ['registry.npmjs.org'] },
        { id: 'arm', kind: 'physics', min_success_rate: 0.75, max_contact_force_n: 20, forbidden_contacts: ['table'] },
      ],
    };
    expect(printWards(ws)).toBe(
      [
        'wards:',
        '  - id: keep-env',
        '    kind: path',
        '    deny: [delete, overwrite]',
        '    paths: [".env", "data/**"]',
        '    case_sensitive: true',
        '  - id: users',
        '    kind: sql',
        '    tables: [users]',
        '    max_rows_lost: 0',
        '  - id: no-leak',
        '    kind: egress',
        '    secrets: [".env"]',
        '    allow_hosts: [registry.npmjs.org]',
        '  - id: arm',
        '    kind: physics',
        '    min_success_rate: 0.75',
        '    max_contact_force_n: 20',
        '    forbidden_contacts: [table]',
        '',
      ].join('\n'),
    );
  });

  it('omits case_sensitive when absent and prints false when set to false', () => {
    const base = { id: 'p', kind: 'path', deny: ['delete'], paths: ['a'] } as const;
    expect(printWards(one(base))).not.toContain('case_sensitive');
    expect(printWards(one({ ...base, case_sensitive: false }))).toContain('    case_sensitive: false\n');
  });

  it('quotes strings that plain style could misread', () => {
    const out = printWards(
      one({ id: 'x', kind: 'physics', min_success_rate: 1, max_contact_force_n: 1, forbidden_contacts: ['0', 'true', 'False', 'NULL', 'null', '', '~', 'a b', 'q"\\'] }),
    );
    expect(out).toContain('forbidden_contacts: ["0", "true", "False", "NULL", "null", "", "~", "a b", "q\\"\\\\"]');
  });

  it('keeps plain identifiers plain', () => {
    const out = printWards(one({ id: 'x', kind: 'physics', min_success_rate: 1, max_contact_force_n: 1, forbidden_contacts: ['gripper_1', 'a.b-c', 'truex'] }));
    expect(out).toContain('[gripper_1, a.b-c, truex]');
  });

  it('escapes hidden characters with \\u and \\U escapes', () => {
    const s = 'a\u200Bb\u0000c\u007Fd\u0085e\u2028f\u2029g\uFEFFh\u202Ei\u2066j\u{E0041}k\n';
    const out = printWards(one({ id: 'x', kind: 'physics', min_success_rate: 1, max_contact_force_n: 1, forbidden_contacts: [s] }));
    expect(out).toContain(
      '["a\\u200Bb\\u0000c\\u007Fd\\u0085e\\u2028f\\u2029g\\uFEFFh\\u202Ei\\u2066j\\U000E0041k\\u000A"]',
    );
    expect(/[\u0000-\u0008\u200B\u2028\uFEFF\u202E]/u.test(out)).toBe(false);
    expect(out).not.toContain('\u{E0041}');
  });

  it('keeps ordinary non-ASCII text and emoji unescaped', () => {
    const out = printWards(one({ id: 'x', kind: 'physics', min_success_rate: 1, max_contact_force_n: 1, forbidden_contacts: ['\uD55C\uAE00', '\u{1F600}'] }));
    expect(out).toContain('["\uD55C\uAE00", "\u{1F600}"]');
  });

  it('prints -0 as 0 and uses String(n) for numbers', () => {
    const out = printWards(one({ id: 'x', kind: 'physics', min_success_rate: -0, max_contact_force_n: 0.1, forbidden_contacts: [] }));
    expect(out).toContain('min_success_rate: 0\n');
    expect(out).toContain('max_contact_force_n: 0.1\n');
  });

  it('prints empty lists as []', () => {
    const out = printWards(one({ id: 'x', kind: 'egress', secrets: ['a'], allow_hosts: [] }));
    expect(out).toContain('    allow_hosts: []\n');
  });

  it('prints an empty ward set as wards: []', () => {
    expect(printWards({ wards: [] })).toBe('wards: []\n');
  });

  it('ends with exactly one newline', () => {
    const out = printWards(one({ id: 'x', kind: 'sql', tables: ['t'], max_rows_lost: 3 }));
    expect(out.endsWith('3\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });

  describe('safe_commands', () => {
    const ws = one({ id: 'x', kind: 'sql', tables: ['t'], max_rows_lost: 3 });

    it('appends a top-level flow line after the last ward', () => {
      expect(printWards(ws, { safeCommands: ['ls', 'git status'] })).toBe(
        'wards:\n  - id: x\n    kind: sql\n    tables: [t]\n    max_rows_lost: 3\nsafe_commands: [ls, "git status"]\n',
      );
    });

    it('is omitted when absent or empty', () => {
      const base = printWards(ws);
      expect(base).not.toContain('safe_commands');
      expect(printWards(ws, {})).toBe(base);
      expect(printWards(ws, { safeCommands: [] })).toBe(base);
    });

    it('follows an empty ward set', () => {
      expect(printWards({ wards: [] }, { safeCommands: ['ls'] })).toBe('wards: []\nsafe_commands: [ls]\n');
    });
  });
});
