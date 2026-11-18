import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as texts from '../../src/texts';

const source = readFileSync(new URL('../../src/texts.ts', import.meta.url), 'utf8');

function allFixedTexts(): string[] {
  const out: string[] = [];
  for (const value of Object.values(texts)) {
    if (typeof value === 'string') out.push(value);
  }
  out.push(texts.unknownWardEntryText('vase'), texts.determinismReproducedText('0123456789abcdef'));
  return out;
}

describe('texts.ts', () => {
  it('uses neither "sealed" nor "isolated" in any fixed text', () => {
    for (const t of allFixedTexts()) expect(t).not.toMatch(/\b(sealed|isolated)\b/i);
    expect(source).not.toMatch(/sealed|isolated/i);
  });

  it('contains no hidden Unicode code points', () => {
    const hidden =
      /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]|[\u{E0000}-\u{E007F}]/u;
    expect(source).not.toMatch(hidden);
    for (const t of allFixedTexts()) expect(t).not.toMatch(hidden);
  });

  it('keeps the P2 text switched on', () => {
    expect(texts.P2_TEXT_ENABLED).toBe(true);
  });

  it('formats the dynamic texts as required', () => {
    expect(texts.unknownWardEntryText('vsae')).toBe('Ward entry "vsae" matches no body in this world.');
    expect(texts.determinismReproducedText('0123456789abcdef')).toBe(
      'Determinism check: this browser reproduced the reference trajectory (hash 0123456789ab).',
    );
  });
});
