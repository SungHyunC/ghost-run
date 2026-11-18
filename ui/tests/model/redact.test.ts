// Examples for the secret-like key rule (UI-P4, model leg).
// **Validates: Requirements 2.7, 4.8, 4.9, 5.5, 5.11**
import { describe, expect, it } from 'vitest';
import { HIDDEN_SECRET } from '../../src/model/texts';
import {
  SECRET_LIKE_WORDS,
  flattenGeneric,
  isSecretLikeKey,
  redactGenericValue,
} from '../../src/model/redact';

const HIDDEN = { kind: 'hidden', text: HIDDEN_SECRET };

function mixed(s: string): string {
  return Array.from(s)
    .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
    .join('');
}

describe('isSecretLikeKey examples', () => {
  it('has the eleven words', () => {
    expect(SECRET_LIKE_WORDS).toHaveLength(11);
  });

  it.each(SECRET_LIKE_WORDS.map((w) => [w]))('detects %s in lower, upper, and mixed case', (w) => {
    expect(isSecretLikeKey(w)).toBe(true);
    expect(isSecretLikeKey(w.toUpperCase())).toBe(true);
    expect(isSecretLikeKey(mixed(w))).toBe(true);
  });

  it.each([['userSessionId'], ['X-Auth-Token'], ['API_KEY']])('detects %s', (k) => {
    expect(isSecretLikeKey(k)).toBe(true);
  });

  it.each([['name'], ['path']])('does not match %s', (k) => {
    expect(isSecretLikeKey(k)).toBe(false);
  });

  it.each([['privateKey'], ['x-api-key'], ['pwd']])('documented miss: %s', (k) => {
    expect(isSecretLikeKey(k)).toBe(false);
  });

  it('documented false positive: session_count', () => {
    expect(isSecretLikeKey('session_count')).toBe(true);
  });
});

describe('redactGenericValue examples', () => {
  it('hides a nested object under a secret-like key at depth 3 without descending', () => {
    const value = { a: { b: { Token: { inner: 'visible-1', list: ['sk-CANARY-abc123'] } } } };
    const node = redactGenericValue(value, null);
    expect(JSON.stringify(node)).not.toContain('sk-CANARY-abc123');
    expect(JSON.stringify(node)).not.toContain('visible-1');
    const rows = flattenGeneric(node);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 3]);
    expect(rows[3]).toEqual({ depth: 3, key: 'Token', valueText: HIDDEN_SECRET, hidden: true });
  });

  it('array indices are not keys', () => {
    const node = redactGenericValue(['visible-1', { password: 'sk-CANARY-x', name: 'visible-2' }], null);
    expect(node).toEqual({
      kind: 'array',
      items: [
        { kind: 'primitive', text: 'visible-1' },
        {
          kind: 'object',
          entries: [
            { key: 'password', node: HIDDEN },
            { key: 'name', node: { kind: 'primitive', text: 'visible-2' } },
          ],
        },
      ],
    });
  });

  it('a circular object yields [circular reference]', () => {
    const o: Record<string, unknown> = { name: 'visible-1' };
    o['self'] = o;
    expect(redactGenericValue(o, null)).toEqual({
      kind: 'object',
      entries: [
        { key: 'name', node: { kind: 'primitive', text: 'visible-1' } },
        { key: 'self', node: { kind: 'marker', text: '[circular reference]' } },
      ],
    });
  });

  it('a 9-level value yields [nested too deep]', () => {
    let v: unknown = { leaf: 'visible-0' };
    for (let i = 0; i < 8; i++) v = { next: v };
    const text = JSON.stringify(redactGenericValue(v, null));
    expect(text).toContain('[nested too deep]');
    expect(text).not.toContain('visible-0');
  });

  it('an 8-level value is fully shown', () => {
    let v: unknown = { leaf: 'visible-0' };
    for (let i = 0; i < 7; i++) v = { next: v };
    const text = JSON.stringify(redactGenericValue(v, null));
    expect(text).toContain('visible-0');
    expect(text).not.toContain('[nested too deep]');
  });

  it('a throwing getter yields [unreadable value] and siblings render', () => {
    const o = {
      before: 'visible-1',
      get boom(): string {
        throw new Error('nope');
      },
      after: 'visible-2',
    };
    const node = redactGenericValue(o, null);
    expect(node).toEqual({
      kind: 'object',
      entries: [
        { key: 'before', node: { kind: 'primitive', text: 'visible-1' } },
        { key: 'boom', node: { kind: 'marker', text: '[unreadable value]' } },
        { key: 'after', node: { kind: 'primitive', text: 'visible-2' } },
      ],
    });
  });

  it('a shared non-circular reference renders twice', () => {
    const shared = { x: 'visible-1' };
    const node = redactGenericValue({ a: shared, b: shared }, null);
    const item = { kind: 'object', entries: [{ key: 'x', node: { kind: 'primitive', text: 'visible-1' } }] };
    expect(node).toEqual({
      kind: 'object',
      entries: [
        { key: 'a', node: item },
        { key: 'b', node: item },
      ],
    });
  });
});
