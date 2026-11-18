import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Source scan of the deterministic code: no trigonometry, exp, log, pow, random source, or clock, and
// `**` only with an integer exponent. Comments are removed before matching.
// Validates: Requirements 5.6, 3.6, 3.7.

const FILES = ['controller.ts', 'ik.ts', 'prng.ts', 'variant.ts'] as const; // the noise and delay code lives in controller.ts, prng.ts, and variant.ts

const BANNED_MATH = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'log', 'pow'] as const;

/** Replaces every comment by spaces (newlines kept), leaving string and template literals intact. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i += 1;
      }
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (; i < stop; i += 1) out += src[i] === '\n' ? '\n' : ' ';
    } else if (c === "'" || c === '"' || c === '`') {
      out += c;
      i += 1;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') {
          out += src[i] as string;
          i += 1;
        }
        if (i < src.length) out += src[i] as string;
        i += 1;
      }
      if (i < src.length) out += c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Descriptions of every banned construct found in comment-free source. */
export function findViolations(code: string): string[] {
  const found: string[] = [];
  const mathCall = new RegExp(`\\bMath\\s*\\.\\s*(${BANNED_MATH.join('|')})\\b`, 'g');
  for (const m of code.matchAll(mathCall)) found.push(`Math.${m[1] as string}`);
  if (/\bMath\s*\.\s*random\b/.test(code)) found.push('Math.random');
  if (/\bMath\s*\[/.test(code)) found.push('Math[...] (computed access)');
  if (/\bDate\b/.test(code)) found.push('Date');
  if (/\bperformance\s*\.\s*now\b/.test(code)) found.push('performance.now');
  for (const m of code.matchAll(/\*\*=?\s*([^\s;,)\]}]*)/g)) {
    const exponent = m[1] as string;
    if (!/^\d+$/.test(exponent)) found.push(`** with exponent "${exponent}"`);
  }
  return found;
}

describe('banned-function scan', () => {
  it.each(FILES)('%s uses no banned Math function, random source, clock, or non-integer power', (file) => {
    const src = readFileSync(fileURLToPath(new URL(`../../src/${file}`, import.meta.url)), 'utf8');
    expect(findViolations(stripComments(src))).toEqual([]);
  });

  it('strips line and block comments, including the doc opener, and keeps code', () => {
    const src = '/** Math.sin and Date in a doc */\nconst a = 1; // Math.pow(2, 3)\n/* Math.random */ const b = a + 1;';
    const code = stripComments(src);
    expect(code).not.toContain('Math');
    expect(code).toContain('const a = 1;');
    expect(code).toContain('const b = a + 1;');
    expect(findViolations(code)).toEqual([]);
  });

  it('keeps comment markers inside string literals as code text', () => {
    expect(stripComments('const u = "a//b"; const v = 1;')).toBe('const u = "a//b"; const v = 1;');
  });

  it('detects each banned construct in code', () => {
    for (const fn of BANNED_MATH) expect(findViolations(`const x = Math.${fn}(y);`)).toEqual([`Math.${fn}`]);
    expect(findViolations('Math.random()')).toEqual(['Math.random']);
    expect(findViolations('new Date()')).toEqual(['Date']);
    expect(findViolations('Date.now()')).toEqual(['Date']);
    expect(findViolations('const x = y ** 0.5;')).toEqual(['** with exponent "0.5"']);
    expect(findViolations('const x = y ** z;')).toEqual(['** with exponent "z"']);
  });

  it('accepts an integer exponent and the allowed Math functions', () => {
    expect(findViolations('const x = y ** 2 + Math.sqrt(z) + Math.min(a, b) + Math.max(a, b) + Math.abs(a) + Math.floor(a) + Math.ceil(a);')).toEqual([]);
  });
});
