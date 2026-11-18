// Feature: possession, timing and adversarial-input examples
// **Validates: Requirements 6.4, 6.5, 11.13**
//
// Scope: running-time examples. Bounds are generous and wall-clock based, so they
// guard against quadratic behavior and not against small slowdowns.

import { describe, expect, it } from 'vitest';
import { sanitizeText } from '../../src/possession/sanitize.js';
import { scanText } from '../../src/possession/scan.js';

// Built from code points, never written literally.
const ZWJ = String.fromCodePoint(0x200d);
const VS16 = String.fromCodePoint(0xfe0f);
const SKIN = String.fromCodePoint(0x1f3fb);
const OPENER = String.fromCodePoint(0x3c, 0x21, 0x2d, 0x2d); // HTML comment opener, built from code points

const now = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = now();
  const value = fn();
  return { value, ms: now() - start };
}

const GENEROUS_MS = 10_000;

describe('timing and adversarial inputs', () => {
  it('scans 1 MiB of ASCII in under 1 second', () => {
    const unit = 'The quick brown fox jumps over the lazy dog 0123456789\n';
    const text = unit.repeat(Math.ceil((1024 * 1024) / unit.length)).slice(0, 1024 * 1024);
    expect(text.length).toBe(1024 * 1024);
    const { value, ms } = timed(() => scanText(text));
    expect(value.findings).toEqual([]);
    expect(ms).toBeLessThan(1000);
  });

  it('handles a long run of ZWJ with modifiers', () => {
    const text = (ZWJ + VS16 + SKIN).repeat(100_000);
    const { value, ms } = timed(() => scanText(text));
    expect(value.findings.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(GENEROUS_MS);
  });

  it('handles many comment openers with no closer', () => {
    const text = (OPENER + ' a ').repeat(100_000);
    const { value, ms } = timed(() => scanText(text, { markdown: true }));
    expect(Array.isArray(value.findings)).toBe(true);
    expect(ms).toBeLessThan(GENEROUS_MS);
  });

  it('sanitizes 100,000 nested opener fragments', () => {
    const text = OPENER.slice(0, 3).repeat(100_000) + OPENER.repeat(100_000);
    const { value, ms } = timed(() => sanitizeText(text, { markdown: true }));
    expect(typeof value).toBe('string');
    expect(ms).toBeLessThan(GENEROUS_MS);
  });
});
