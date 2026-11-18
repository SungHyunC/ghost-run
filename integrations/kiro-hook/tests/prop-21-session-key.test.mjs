// Property test for the session key (task 4.4). No Docker needed [no-docker].
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sessionKey } from '../lib/store/session-key.mjs';
import { FC_PARAMS } from './pbt-config.mjs';

const PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/** Strings that already match the key pattern. */
const matching = fc
  .array(fc.constantFrom(...SAFE_CHARS), { minLength: 1, maxLength: 64 })
  .map((cs) => cs.join(''));

/** Hidden and awkward characters, built from code points only. */
const awkwardPoints = [
  0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202a, 0x202e, 0x2066, 0x2069, 0xe0041, 0xe007f,
  0x2f, 0x5c, 0x2e, 0x00, 0x0a, 0x20, 0x1f47b, 0xd55c,
];
const awkwardChar = fc.oneof(
  fc.constantFrom(...awkwardPoints).map((cp) => String.fromCodePoint(cp)),
  fc.constantFrom(...SAFE_CHARS),
  fc.string({ maxLength: 1 }),
);
const awkward = fc.array(awkwardChar, { maxLength: 100 }).map((cs) => cs.join(''));

/** Arbitrary ids: any string, awkward strings, and matching strings, plus empty and over-long ones. */
const anyId = fc.oneof(
  fc.string({ maxLength: 200 }),
  fc.string({ unit: 'binary', maxLength: 100 }),
  awkward,
  matching,
  fc.constant(''),
  fc.integer({ min: 65, max: 130 }).map((n) => 'a'.repeat(n)),
);

describe('session key', () => {
  it('Property 21: result always matches the pattern, keeps matching input, is deterministic', () => {
    // Feature: kiro-integration, Property 21: Session key
    // **Validates: Requirements 12.2, 13.1**
    fc.assert(
      fc.property(anyId, (id) => {
        const key = sessionKey(id);
        expect(key).toMatch(PATTERN);
        expect(sessionKey(id)).toBe(key);
        if (PATTERN.test(id)) expect(key).toBe(id);
        else expect(key).toBe(createHash('sha256').update(Buffer.from(id, 'utf8')).digest('hex'));
      }),
      FC_PARAMS,
    );
  });

  it('Property 21: different inputs get different keys', () => {
    // Feature: kiro-integration, Property 21: Session key
    // **Validates: Requirements 12.2, 13.1**
    fc.assert(
      fc.property(anyId, anyId, (a, b) => {
        fc.pre(a !== b);
        const sameDigest =
          createHash('sha256').update(Buffer.from(a, 'utf8')).digest('hex') ===
          createHash('sha256').update(Buffer.from(b, 'utf8')).digest('hex');
        // Lone surrogates encode to the same UTF-8 bytes (U+FFFD); the key is defined on those bytes.
        fc.pre(!sameDigest);
        expect(sessionKey(a)).not.toBe(sessionKey(b));
      }),
      FC_PARAMS,
    );
  });

  it('Property 21: two different matching inputs keep distinct keys', () => {
    // Feature: kiro-integration, Property 21: Session key
    // **Validates: Requirements 12.2, 13.1**
    fc.assert(
      fc.property(matching, matching, (a, b) => {
        fc.pre(a !== b);
        expect(sessionKey(a)).not.toBe(sessionKey(b));
      }),
      FC_PARAMS,
    );
  });

  it('fixed examples: empty, over-long, separators, hidden characters', () => {
    expect(sessionKey('')).toMatch(PATTERN);
    expect(sessionKey('a'.repeat(64))).toBe('a'.repeat(64));
    expect(sessionKey('a'.repeat(65))).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionKey('../x')).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionKey('a' + String.fromCodePoint(0x200b))).toMatch(/^[0-9a-f]{64}$/);
  });
});
