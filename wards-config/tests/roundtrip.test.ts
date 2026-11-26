import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { WardSet } from '@ghost-run/core';
import { parseWards } from '../src/parse.js';
import { printWards } from '../src/print.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config';
import { safeCommandsArb, trustedCommandsArb, wardSetArb } from './fixtures';

const roundTrip = (ws: WardSet, sc: string[]) => {
  const text = printWards(ws, { safeCommands: sc });
  return { text, parsed: parseWards(text) };
};

describe('Property 17: printing and parsing round trip', () => {
  // Feature: wards, Property 17: Printing and parsing round trip
  // **Validates: Requirements 14.1, 14.2, 14.3, 14.5, 12.13**
  it(
    'parse(print(ws, sc)) equals (ws, sc) and printing again is identical',
    () => {
      fc.assert(
        fc.property(wardSetArb, safeCommandsArb, (ws, sc) => {
          const { text, parsed } = roundTrip(ws, sc);
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          expect(parsed.wardSet).toEqual(ws);
          expect(parsed.safeCommands).toEqual(sc);
          // idempotence: print(parse(print(x))) === print(x)
          expect(printWards(parsed.wardSet, { safeCommands: parsed.safeCommands })).toBe(text);
          // exactly one trailing newline
          expect(text.endsWith('\n')).toBe(true);
          expect(text.endsWith('\n\n')).toBe(false);
          // safe_commands: absent when empty, otherwise one top-level line after the last ward
          const lines = text.split('\n');
          const scLines = lines.filter((l) => l.startsWith('safe_commands:'));
          if (sc.length === 0) {
            expect(text).not.toContain('safe_commands');
          } else {
            expect(scLines).toHaveLength(1);
            expect(lines[lines.length - 2]).toBe(scLines[0]);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  // Feature: wards, Property 17: strings plain style could misread are quoted
  // **Validates: Requirements 14.2, 14.3**
  it('quotes ".env", "data/**", "0" and "true" in the printed text and round-trips them', () => {
    const ws: WardSet = {
      wards: [
        { id: 'p', kind: 'path', deny: ['delete'], paths: ['.env', 'data/**'] },
        { id: 'e', kind: 'egress', secrets: ['.env'], allow_hosts: [] },
        { id: 'x', kind: 'physics', min_success_rate: 0, max_contact_force_n: 1, forbidden_contacts: ['0', 'true'] },
      ],
    };
    const sc = ['0', 'true', '1e3', 'null'];
    const { text, parsed } = roundTrip(ws, sc);
    expect(text).toContain('".env"');
    expect(text).toContain('"data/**"');
    expect(text).toContain('forbidden_contacts: ["0", "true"]');
    expect(text).toContain('safe_commands: ["0", "true", "1e3", "null"]');
    expect(parsed.ok && parsed.wardSet).toEqual(ws);
    expect(parsed.ok && parsed.safeCommands).toEqual(sc);
  });

  it('round-trips an empty ward set with safe commands and an empty list prints no key', () => {
    const empty: WardSet = { wards: [] };
    const a = roundTrip(empty, ['ls']);
    expect(a.text).toBe('wards: []\nsafe_commands: [ls]\n');
    expect(a.parsed.ok && a.parsed.safeCommands).toEqual(['ls']);
    const b = roundTrip(empty, []);
    expect(b.text).toBe('wards: []\n');
    expect(b.parsed.ok && b.parsed.safeCommands).toEqual([]);
  });
});

describe('Property 17b: trusted_commands round trip', () => {
  it(
    'parse(print(ws, sc, tc)) equals (ws, sc, tc), printing again is identical, and the key sits last',
    () => {
      fc.assert(
        fc.property(wardSetArb, safeCommandsArb, trustedCommandsArb, (ws, sc, tc) => {
          const text = printWards(ws, { safeCommands: sc, trustedCommands: tc });
          const parsed = parseWards(text);
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          expect(parsed.wardSet).toEqual(ws);
          expect(parsed.safeCommands).toEqual(sc);
          expect(parsed.trustedCommands).toEqual(tc);
          expect(parsed.warnings.filter((w) => w.message.includes('trusted_commands'))).toEqual([]);
          const again = printWards(parsed.wardSet, {
            safeCommands: parsed.safeCommands,
            trustedCommands: parsed.trustedCommands,
          });
          expect(again).toBe(text);
          const lines = text.split('\n');
          const tcLines = lines.filter((l) => l.startsWith('trusted_commands:'));
          if (tc.length === 0) expect(text).not.toContain('trusted_commands');
          else {
            expect(tcLines).toHaveLength(1);
            expect(lines[lines.length - 2]).toBe(tcLines[0]);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('prints a pattern with wildcards quoted and parses it back', () => {
    const tc = ['corepack pnpm --filter * test', 'npx vitest run **'];
    const text = printWards({ wards: [] }, { trustedCommands: tc });
    expect(text).toBe('wards: []\ntrusted_commands: ["corepack pnpm --filter * test", "npx vitest run **"]\n');
    const r = parseWards(text);
    expect(r.ok && r.trustedCommands).toEqual(tc);
  });
});
