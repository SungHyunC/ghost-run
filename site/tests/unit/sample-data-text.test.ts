import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CANDLE_STATES } from '../../src/showcase/sample-data';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_FILE = resolve(SITE, 'src/showcase/sample-data.ts');
const GALLERY_FILE = resolve(SITE, '../ui/gallery/main.tsx');
const data = readFileSync(DATA_FILE, 'utf8');
const gallery = readFileSync(GALLERY_FILE, 'utf8');

// Hidden ranges: tags, zero-width, bidi controls, word joiner, BOM.
function hiddenCodePoints(text: string): number[] {
  return Array.from(text, (ch) => ch.codePointAt(0) ?? 0).filter(
    (cp) =>
      (cp >= 0xe0000 && cp <= 0xe007f) ||
      (cp >= 0x200b && cp <= 0x200d) ||
      cp === 0x2060 ||
      cp === 0xfeff ||
      (cp >= 0x202a && cp <= 0x202e) ||
      (cp >= 0x2066 && cp <= 0x2069),
  );
}

describe('sample data text', () => {
  it('the gallery source still holds the two shared constants', () => {
    expect(gallery).toContain("const HOST = 'collector.example';");
    expect(gallery).toContain("const CANARY = 'sk-CANARY-abc123';");
    expect(data).toContain("const HOST = 'collector.example';");
    expect(data).toContain("const CANARY = 'sk-CANARY-abc123';");
  });

  it('holds no hidden code point and no comment opener', () => {
    expect(hiddenCodePoints(data)).toEqual([]);
    expect(data).not.toContain(['<', '!', '--'].join(''));
    expect(data).not.toMatch(/\/\*/);
  });

  it('uses only reserved hosts', () => {
    const hosts = data.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:example|test|localhost|invalid)\b/g) ?? [];
    expect(hosts.length).toBeGreaterThan(0);
        expect(new Set(hosts)).toEqual(new Set(['collector.example', 'unrelated.test']));
  });

  it('has the five candle states in order with the claims of the gallery', () => {
    expect(CANDLE_STATES.map((s) => s.id)).toEqual(['pass', 'warn', 'block', 'unknown', 'none']);
    expect(CANDLE_STATES.map((s) => s.label)).toEqual(['Pass', 'Warn', 'Block', 'Unknown', 'No verdict']);
    expect(CANDLE_STATES.map((s) => s.claims?.mode)).toEqual([
      'docker-box',
      'playground',
      'static-analysis',
      undefined,
      undefined,
    ]);
    expect(CANDLE_STATES.map((s) => s.verdict?.verdict)).toEqual(['pass', 'warn', 'block', 'maybe', undefined]);
  });
});
