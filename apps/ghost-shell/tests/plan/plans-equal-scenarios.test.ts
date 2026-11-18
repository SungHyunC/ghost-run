import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePlanFile } from '../../src/plan/plan-file';
import { SCENARIOS } from '../../src/scenarios/scenarios';

const PLANS_DIR = resolve(__dirname, '../../plans');
const FILES = [
  'scenario-1.json',
  'scenario-1-fixed.json',
  'scenario-2.json',
  'scenario-2-fixed.json',
  'scenario-3.json',
  'scenario-4.json',
  'scenario-5.json',
] as const;

const read = (name: string): string => readFileSync(resolve(PLANS_DIR, name), 'utf8');
const parse = (name: string) => {
  const r = parsePlanFile(read(name));
  if (!r.ok) throw new Error(`${name}: ${r.errors.map((e) => e.message).join('; ')}`);
  return r.plan;
};

// Tag characters, zero-width, bidi controls, BOM, word joiner (escapes only).
const HIDDEN = /[\u{E0000}-\u{E007F}\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/u;
const COMMENT_OPENER = '<' + '!--';
const RESERVED = /(\.(example|test|localhost|invalid)|^localhost)$/;

describe('plan files equal the scenarios', () => {
  it('has exactly the seven plan files', () => {
    expect(FILES).toHaveLength(7);
  });

  it.each(FILES)('%s is valid with origin scripted', (name) => {
    const r = parsePlanFile(read(name));
    expect(r.ok).toBe(true);
    expect(parse(name).origin).toBe('scripted');
  });

  it('each Scenario plan equals the actions of its file', () => {
    for (const s of SCENARIOS) {
      expect(s.plan).toEqual(parse(`scenario-${s.id}.json`).actions);
      if (s.fixedPlan !== undefined) {
        expect(s.fixedPlan).toEqual(parse(`scenario-${s.id}-fixed.json`).actions);
      }
    }
    expect(SCENARIOS.filter((s) => s.fixedPlan !== undefined).map((s) => s.id)).toEqual([1, 2]);
  });

  it('scenario-3.json has readings and no provenance', () => {
    const p = parse('scenario-3.json');
    expect(p.readings).toBeDefined();
    expect(p.provenance).toBeUndefined();
  });

  it.each(FILES)('%s has no hidden code point, comment opener, or non-reserved host', (name) => {
    const text = read(name);
    expect(HIDDEN.test(text)).toBe(false);
    expect(text.includes(COMMENT_OPENER)).toBe(false);
    for (const m of text.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/([^\s/:"'\\]+)/gi)) {
      expect(m[1]!.toLowerCase()).toMatch(RESERVED);
    }
  });
});
