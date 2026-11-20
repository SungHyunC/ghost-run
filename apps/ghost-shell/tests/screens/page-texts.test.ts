// The page design texts follow the rules of texts.ts: printable ASCII, no "sealed" or "isolated".
import { describe, expect, it } from 'vitest';
import * as pageTexts from '../../src/page-texts';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('page texts', () => {
  const all = strings(pageTexts);

  it('has texts to check', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it('uses neither "sealed" nor "isolated", no hidden characters, and never calls a plan or ward safe', () => {
    for (const v of all) {
      expect(v).not.toMatch(/sealed|isolated/i);
      expect(v).toMatch(/^[\x20-\x7e]*$/);
      expect(v).not.toMatch(/\bsafe\b/i);
    }
  });

  it('has one card text per scenario', () => {
    expect(Object.keys(pageTexts.SCENARIO_CARDS).sort()).toEqual(['1', '2', '3', '4', '5']);
  });
});
