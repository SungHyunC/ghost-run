import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Ward, WardSet } from '@ghost-run/core';
import { parseWards } from '../src/parse.js';
import { printWards } from '../src/print.js';
import type { ConfigErrorCode } from '../src/types.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config';
import { wardSetArb } from './fixtures';

// Hidden characters are written as escapes only. In the YAML text a double-quoted
// scalar carries the YAML escape (`\\u200B` in TS source is `\u200B` in the YAML).
const HIDDEN_YAML_ESCAPES = ['\\u200B', '\\u202E', '\\u2060', '\\uFEFF', '\\U000E0041', '\\u0007', '\\u2066'];

interface Expectation {
  readonly code: ConfigErrorCode;
  readonly line: number;
}

const wardStarts = (lines: readonly string[]): number[] =>
  lines.flatMap((l, i) => (l.startsWith('  - id:') ? [i] : []));

const fieldIndex = (lines: readonly string[], start: number, name: string): number => {
  for (let i = start + 1; i < lines.length && !(lines[i] as string).startsWith('  - id:'); i++) {
    if ((lines[i] as string).startsWith(`    ${name}:`)) return i;
  }
  throw new Error(`field ${name} not found`);
};

/** The list field of each kind and a second, non-list field. */
const LIST_FIELD: Record<Ward['kind'], string> = {
  path: 'paths',
  sql: 'tables',
  egress: 'secrets',
  physics: 'forbidden_contacts',
};
const REQUIRED_FIELDS: Record<Ward['kind'], string[]> = {
  path: ['deny', 'paths'],
  sql: ['tables', 'max_rows_lost'],
  egress: ['secrets', 'allow_hosts'],
  physics: ['min_success_rate', 'max_contact_force_n', 'forbidden_contacts'],
};

const hasErr = (r: ReturnType<typeof parseWards>, e: Expectation): boolean =>
  !r.ok && r.errors.some((x) => x.code === e.code && x.line === e.line);

type WardMutation =
  | 'unknown-kind'
  | 'missing-field'
  | 'unknown-field'
  | 'wrong-type-list'
  | 'wrong-type-bool'
  | 'duplicate-id'
  | 'out-of-range'
  | 'invalid-glob'
  | 'invalid-host'
  | 'invalid-character'
  | 'duplicate-entry';

const WARD_MUTATIONS: readonly WardMutation[] = [
  'unknown-kind',
  'missing-field',
  'unknown-field',
  'wrong-type-list',
  'wrong-type-bool',
  'duplicate-id',
  'out-of-range',
  'invalid-glob',
  'invalid-host',
  'invalid-character',
  'duplicate-entry',
];

/** Applies one mutation to ward `wi` of the printed text; returns null when it does not apply. */
function applyWardMutation(
  ws: WardSet,
  lines: string[],
  wi: number,
  m: WardMutation,
  pick: number,
  hidden: string,
): Expectation | null {
  const starts = wardStarts(lines);
  const start = starts[wi] as number;
  const ward = ws.wards[wi] as Ward;
  const field = (name: string): number => fieldIndex(lines, start, name);
  const listField = LIST_FIELD[ward.kind];
  switch (m) {
    case 'unknown-kind': {
      lines[field('kind')] = '    kind: ghostly';
      return { code: 'unknown-kind', line: start + 1 };
    }
    case 'missing-field': {
      const names = REQUIRED_FIELDS[ward.kind];
      const name = names[pick % names.length] as string;
      lines.splice(field(name), 1);
      return { code: 'missing-field', line: start + 1 };
    }
    case 'unknown-field': {
      // Insert after the kind line, so the new key line is known.
      const at = field('kind') + 1;
      lines.splice(at, 0, '    bogus_field: 1');
      return { code: 'unknown-field', line: at + 1 };
    }
    case 'wrong-type-list': {
      const i = field(listField);
      lines[i] = `    ${listField}: 5`;
      return { code: 'wrong-type', line: i + 1 };
    }
    case 'wrong-type-bool': {
      if (ward.kind === 'path') {
        const i = field('deny');
        lines[i] = '    deny: delete';
        return { code: 'wrong-type', line: i + 1 };
      }
      if (ward.kind === 'sql') {
        const i = field('max_rows_lost');
        lines[i] = '    max_rows_lost: "many"';
        return { code: 'wrong-type', line: i + 1 };
      }
      if (ward.kind === 'physics') {
        const i = field('max_contact_force_n');
        lines[i] = '    max_contact_force_n: true';
        return { code: 'wrong-type', line: i + 1 };
      }
      const i = field('allow_hosts');
      lines[i] = '    allow_hosts: 7';
      return { code: 'wrong-type', line: i + 1 };
    }
    case 'duplicate-id': {
      // Append a copy of ward `wi`; the copy starts on the next free line.
      const end = wi + 1 < starts.length ? (starts[wi + 1] as number) : lines.length;
      const copy = lines.slice(start, end);
      const at = lines.length;
      lines.push(...copy);
      return { code: 'duplicate-id', line: at + 1 };
    }
    case 'out-of-range': {
      if (ward.kind === 'path') {
        const i = field('deny');
        lines[i] = '    deny: [truncate]';
        return { code: 'out-of-range', line: i + 1 };
      }
      if (ward.kind === 'sql') {
        const i = field('max_rows_lost');
        lines[i] = `    max_rows_lost: -${1 + (pick % 50)}`;
        return { code: 'out-of-range', line: i + 1 };
      }
      if (ward.kind === 'egress') {
        const i = field('secrets');
        lines[i] = '    secrets: []';
        return { code: 'out-of-range', line: i + 1 };
      }
      const i = field('min_success_rate');
      lines[i] = '    min_success_rate: 1.5';
      return { code: 'out-of-range', line: i + 1 };
    }
    case 'invalid-glob': {
      if (ward.kind !== 'path' && ward.kind !== 'egress') return null;
      const i = field(listField);
      lines[i] = `    ${listField}: ["/abs"]`;
      return { code: 'invalid-glob', line: i + 1 };
    }
    case 'invalid-host': {
      if (ward.kind !== 'egress') return null;
      const i = field('allow_hosts');
      lines[i] = '    allow_hosts: ["a.example/path"]';
      return { code: 'invalid-host', line: i + 1 };
    }
    case 'invalid-character': {
      const i = field(listField);
      lines[i] = `    ${listField}: ["ab${hidden}cd"]`;
      return { code: 'invalid-character', line: i + 1 };
    }
    case 'duplicate-entry': {
      const i = field(listField);
      lines[i] = `    ${listField}: ["dup", "dup"]`;
      return { code: 'duplicate-entry', line: i + 1 };
    }
  }
}

describe('Property 15: every configuration defect is reported at its line with the expected code', () => {
  // Feature: wards, Property 15: Every configuration defect is reported at its line with the expected code
  // **Validates: Requirements 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 12.13, 13.1, 13.2, 13.9, 13.11**
  it(
    'a ward mutation is reported with the expected code at the expected line',
    () => {
      let applied = 0;
      fc.assert(
        fc.property(
          wardSetArb,
          fc.nat(),
          fc.constantFrom(...WARD_MUTATIONS),
          fc.nat(),
          fc.constantFrom(...HIDDEN_YAML_ESCAPES),
          (ws, wardPick, mutation, pick, hidden) => {
            const text = printWards(ws);
            expect(parseWards(text).ok).toBe(true);
            const lines = text.split('\n');
            const wi = wardPick % ws.wards.length;
            const expected = applyWardMutation(ws, lines, wi, mutation, pick, hidden);
            fc.pre(expected !== null);
            applied++;
            const result = parseWards(lines.join('\n'));
            expect(result.ok).toBe(false);
            expect(hasErr(result, expected as Expectation)).toBe(true);
          },
        ),
        { numRuns: NUM_RUNS },
      );
      expect(applied).toBeGreaterThan(0);
    },
    PBT_TIMEOUT,
  );

  // Feature: wards, Property 15: Every configuration defect is reported at its line with the expected code
  // **Validates: Requirements 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 12.13, 13.1, 13.2, 13.9, 13.11**
  it(
    'a safe_commands mutation is reported at its item or list line and no message contains the entry text',
    () => {
      const tokenArb = fc
        .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 8 })
        .map((cs) => `Zq9${cs.join('')}`);
      const validEntriesArb = fc.uniqueArray(tokenArb, { minLength: 1, maxLength: 6 });
      const operators = [';', '&&', '|', '>', '`', '$', '"', "'"];
      const quote = (s: string): string => (s.includes('"') ? `'${s}'` : `"${s}"`);
      type Kind =
        | 'non-list'
        | 'non-string-item'
        | 'hidden-char'
        | 'over-long'
        | 'too-many'
        | 'too-many-flow'
        | 'shell-operator'
        | 'duplicate';
      const kinds: Kind[] = [
        'non-list',
        'non-string-item',
        'hidden-char',
        'over-long',
        'too-many',
        'too-many-flow',
        'shell-operator',
        'duplicate',
      ];

      fc.assert(
        fc.property(
          wardSetArb,
          validEntriesArb,
          fc.constantFrom(...kinds),
          fc.nat(),
          fc.constantFrom(...HIDDEN_YAML_ESCAPES),
          fc.constantFrom(...operators),
          fc.integer({ min: 257, max: 400 }),
          fc.constantFrom('5', 'true', '[Zq9seq]', '{Zq9key: Zq9val}', '1.5'),
          (ws, entries, kind, pick, hidden, op, longLen, nonString) => {
            const head = printWards(ws).split('\n').slice(0, -1);
            const keyLine = head.length + 1; // 1-based line of `safe_commands:`
            const block = (items: readonly string[]): string[] => ['safe_commands:', ...items.map((e) => `  - ${e}`)];
            const plain = entries.map(quote);

            // Sanity: the unmutated document is valid.
            const okText = [...head, ...block(plain), ''].join('\n');
            const ok = parseWards(okText);
            expect(ok.ok && ok.safeCommands).toEqual(entries);

            const k = pick % entries.length;
            let items = [...plain];
            let tail: string[];
            let expected: Expectation;
            let secretText: string;
            switch (kind) {
              case 'non-list':
                tail = [`safe_commands: ${nonString.startsWith('[') ? 'Zq9scalar' : nonString}`];
                expected = { code: 'wrong-type', line: keyLine };
                secretText = 'Zq9scalar';
                break;
              case 'non-string-item':
                items[k] = nonString;
                tail = block(items);
                expected = { code: 'wrong-type', line: keyLine + 1 + k };
                secretText = 'Zq9';
                break;
              case 'hidden-char':
                items[k] = `"Zq9ab${hidden}cd"`;
                tail = block(items);
                expected = { code: 'invalid-character', line: keyLine + 1 + k };
                secretText = 'Zq9ab';
                break;
              case 'over-long':
                items[k] = `"Zq9${'a'.repeat(longLen)}"`;
                tail = block(items);
                expected = { code: 'out-of-range', line: keyLine + 1 + k };
                secretText = 'Zq9aaaa';
                break;
              case 'too-many':
                items = Array.from({ length: 257 + (pick % 10) }, (_, i) => `Zq9c${i}`);
                tail = block(items);
                expected = { code: 'out-of-range', line: keyLine + 1 };
                secretText = 'Zq9c';
                break;
              case 'too-many-flow':
                tail = [`safe_commands: [${Array.from({ length: 257 }, (_, i) => `Zq9c${i}`).join(', ')}]`];
                expected = { code: 'out-of-range', line: keyLine };
                secretText = 'Zq9c';
                break;
              case 'shell-operator':
                items[k] = quote(`Zq9ab ${op} Zq9cd`);
                tail = block(items);
                expected = { code: 'unsafe-command-entry', line: keyLine + 1 + k };
                secretText = 'Zq9ab';
                break;
              case 'duplicate':
                items = [...plain, quote(entries[k] as string)];
                tail = block(items);
                expected = { code: 'duplicate-entry', line: keyLine + 1 + entries.length };
                secretText = entries[k] as string;
                break;
            }
            const result = parseWards([...head, ...tail, ''].join('\n'));
            expect(result.ok).toBe(false);
            expect(hasErr(result, expected)).toBe(true);
            if (!result.ok) {
              // No error carries the entry text, in any field.
              for (const e of result.errors) {
                expect(JSON.stringify(e)).not.toContain(secretText);
                if (kind === 'shell-operator') expect(JSON.stringify(e)).not.toContain('Zq9cd');
              }
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  // Fixed examples (documentation of the exact codes; no generator).
  it('reports the spacing detail for a safe entry with doubled spaces', () => {
    const r = parseWards('wards: []\nsafe_commands:\n  - "ls  -l"\n');
    expect(!r.ok && r.errors[0]).toMatchObject({ code: 'unsafe-command-entry', line: 3, detail: 'spacing' });
  });

  it('accepts a 256-character entry and 256 entries (boundaries)', () => {
    const long = 'a'.repeat(256);
    const many = Array.from({ length: 256 }, (_, i) => `c${i}`);
    const a = parseWards(`wards: []\nsafe_commands: ["${long}"]\n`);
    const b = parseWards(`wards: []\nsafe_commands: [${many.join(', ')}]\n`);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});
