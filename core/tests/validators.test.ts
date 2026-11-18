/**
 * Unit tests for the strict validators and the exact host formats.
 * Everything is imported from the public entry point, which also checks the exports.
 * Hidden characters are written as escapes only.
 */
import { describe, expect, it } from 'vitest';
import {
  compileAllowHosts,
  hostEntryKey,
  parseDestination,
  validateGlob,
  validateHostEntry,
} from '../src/index.js';
import type { GlobErrorCode, HostEntryErrorCode } from '../src/index.js';

describe('validateGlob: one example per error code', () => {
  const cases: ReadonlyArray<readonly [GlobErrorCode, string]> = [
    ['pattern-too-long', 'a'.repeat(513)],
    ['empty-pattern', ''],
    ['invalid-character', 'a\u200Bb'],
    ['absolute-pattern', '/etc/passwd'],
    ['unsupported-glob-syntax', '!secrets'],
    ['parent-segment', 'a/../b'],
    ['unterminated-class', 'a[bc'],
    ['empty-class', 'a[]'],
    ['descending-range', 'a[z-a]'],
    ['partial-doublestar', 'src/**a'],
  ];

  it.each(cases)('%s', (code, pattern) => {
    const result = validateGlob(pattern);
    expect(result).not.toBeNull();
    expect(result?.code).toBe(code);
    expect(typeof result?.message).toBe('string');
    expect(result?.message.length).toBeGreaterThan(0);
  });

  it('covers all ten codes', () => {
    expect(new Set(cases.map(([c]) => c)).size).toBe(10);
  });

  it('accepts valid patterns', () => {
    expect(validateGlob('src/**/*.ts')).toBeNull();
    expect(validateGlob('a[a-z]?')).toBeNull();
    expect(validateGlob('a'.repeat(512))).toBeNull();
  });
});

describe('validateHostEntry: one example per error code', () => {
  const cases: ReadonlyArray<readonly [HostEntryErrorCode, string]> = [
    ['empty-host', ''],
    ['scheme-not-allowed', 'https://api.example.test'],
    ['path-not-allowed', 'api.example.test/v1'],
    ['userinfo-not-allowed', 'user@api.example.test'],
    ['invalid-port', 'api.example.test:0'],
    ['invalid-hostname', 'a_b.example.test'],
    ['invalid-wildcard', '*.test'],
    ['invalid-ip', '[xyz]'],
    ['invalid-character', 'api\u200B.example.test'],
  ];

  it.each(cases)('%s', (code, entry) => {
    const result = validateHostEntry(entry);
    expect(result).not.toBeNull();
    expect(result?.code).toBe(code);
    expect(typeof result?.message).toBe('string');
    expect(result?.message.length).toBeGreaterThan(0);
  });

  it('covers all nine codes', () => {
    expect(new Set(cases.map(([c]) => c)).size).toBe(9);
  });

  it('accepts valid entries', () => {
    for (const e of ['api.example.test', '*.example.test', 'api.example.test:443', '192.0.2.10', '[::1]:8080']) {
      expect(validateHostEntry(e)).toBeNull();
    }
  });
});

describe('host matching examples', () => {
  it('Registry.NPMJS.org. equals registry.npmjs.org', () => {
    expect(hostEntryKey('Registry.NPMJS.org.')).toBe(hostEntryKey('registry.npmjs.org'));
    const ref = parseDestination('Registry.NPMJS.org.');
    expect(ref).toEqual({ kind: 'name', host: 'registry.npmjs.org' });
    expect(compileAllowHosts(['registry.npmjs.org']).allows(ref)).toBe(true);
    expect(compileAllowHosts(['Registry.NPMJS.org.']).allows(parseDestination('registry.npmjs.org'))).toBe(true);
  });

  it('*.example.test allows neither example.test nor a.b.example.test', () => {
    const allow = compileAllowHosts(['*.example.test']);
    expect(allow.allows(parseDestination('example.test'))).toBe(false);
    expect(allow.allows(parseDestination('a.b.example.test'))).toBe(false);
    expect(allow.allows(parseDestination('a.example.test'))).toBe(true);
  });

  it('3232235786 is not allowed by an IPv4 entry', () => {
    const ref = parseDestination('3232235786');
    expect(ref?.kind).toBe('name');
    expect(compileAllowHosts(['192.168.1.10']).allows(ref)).toBe(false);
    expect(compileAllowHosts(['192.0.2.10']).allows(ref)).toBe(false);
  });
});
