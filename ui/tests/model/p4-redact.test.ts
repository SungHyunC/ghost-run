// Feature: ui-kit, Property 4: No secret forwarding (model leg, tag UI-P4).
// **Validates: Requirements 2.7, 4.8, 4.9, 5.5, 5.11**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { GENERIC_DEPTH } from '../../src/model/limits';
import { HIDDEN_SECRET } from '../../src/model/texts';
import { isSecretLikeKey, redactGenericValue, type GenericNode } from '../../src/model/redact';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';
import {
  circularValue,
  deepValue,
  genericValue,
  plainKey,
  secretLikeKey,
  secretLikeOracle,
} from '../fixtures/arbitraries';

console.log(`UI-P4 model leg seed=${PBT_SEED}`);

const CANARY_PART = 'sk-CANARY-';

/** Independent expectation for JSON-like generated input (no cycles, no getters). */
function expected(value: unknown, key: string | null, depth: number): unknown {
  if (key !== null && secretLikeOracle(key)) return { kind: 'hidden' };
  if (value === null || typeof value !== 'object') return { kind: 'primitive' };
  if (depth >= GENERIC_DEPTH) return { kind: 'marker', text: '[nested too deep]' };
  if (Array.isArray(value)) return { kind: 'array', items: value.map((v) => expected(v, null, depth + 1)) };
  const rec = value as Record<string, unknown>;
  return {
    kind: 'object',
    entries: Object.keys(rec).map((k) => ({ key: k, node: expected(rec[k], k, depth + 1) })),
  };
}

/** Project a real node onto the shape of `expected` (drops primitive text). */
function shape(node: GenericNode): unknown {
  switch (node.kind) {
    case 'primitive':
      return { kind: 'primitive' };
    case 'hidden':
      return { kind: 'hidden' };
    case 'marker':
      return { kind: 'marker', text: node.text };
    case 'array':
      return { kind: 'array', items: node.items.map(shape) };
    case 'object':
      return { kind: 'object', entries: node.entries.map((e) => ({ key: e.key, node: shape(e.node) })) };
  }
}

function hasMarker(node: GenericNode, text: string): boolean {
  switch (node.kind) {
    case 'marker':
      return node.text === text;
    case 'array':
      return node.items.some((n) => hasMarker(n, text));
    case 'object':
      return node.entries.some((e) => hasMarker(e.node, text));
    default:
      return false;
  }
}

function countHidden(node: GenericNode): number {
  switch (node.kind) {
    case 'hidden':
      return 1;
    case 'array':
      return node.items.reduce((n, c) => n + countHidden(c), 0);
    case 'object':
      return node.entries.reduce((n, e) => n + countHidden(e.node), 0);
    default:
      return 0;
  }
}

describe('UI-P4 model leg: redaction of secret-like keys', () => {
  it('isSecretLikeKey equals the independent oracle for secret-like and plain keys', () => {
    const counter = createCounter('UI-P4 isSecretLikeKey');
    fc.assert(
      fc.property(fc.oneof(secretLikeKey, plainKey, fc.string({ maxLength: 20 })), (k) => {
        const got = isSecretLikeKey(k);
        counter.add(got ? 'secret' : 'plain');
        expect(got).toBe(secretLikeOracle(k));
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, ['secret', 'plain']);
  }, PBT_TIMEOUT);

  it('generated secret-like keys are always detected and plain keys never', () => {
    fc.assert(
      fc.property(secretLikeKey, plainKey, (s, p) => {
        expect(isSecretLikeKey(s)).toBe(true);
        expect(isSecretLikeKey(p)).toBe(false);
      }),
      params('full'),
    );
  }, PBT_TIMEOUT);

  it('hides exactly the secret-like keys, whole subtree, without throwing or mutating', () => {
    const counter = createCounter('UI-P4 redactGenericValue');
    fc.assert(
      fc.property(genericValue(6), (value) => {
        const before = structuredClone(value);
        const node = redactGenericValue(value, null);
        expect(value).toEqual(before);
        expect(shape(node)).toEqual(expected(value, null, 0));
        const text = JSON.stringify(node);
        expect(text).not.toContain(CANARY_PART);
        const hidden = countHidden(node);
        counter.add(hidden > 0 ? 'withHidden' : 'withoutHidden');
        if (hidden > 0 && text.includes('visible-')) counter.add('hiddenAndVisible');
        if (hasMarker(node, '[nested too deep]')) counter.add('tooDeep');
        if (text.includes(HIDDEN_SECRET) === false && hidden > 0) throw new Error('hidden node lost its text');
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, ['withHidden', 'withoutHidden', 'hiddenAndVisible']);
  }, PBT_TIMEOUT);

  it('a secret-like key hides its value at the key position, whatever the value is', () => {
    fc.assert(
      fc.property(secretLikeKey, genericValue(3), (k, v) => {
        expect(redactGenericValue(v, k)).toEqual({ kind: 'hidden', text: HIDDEN_SECRET });
      }),
      params('full'),
    );
  }, PBT_TIMEOUT);

  it('terminates for circular input and marks the repeated ancestor', () => {
    const counter = createCounter('UI-P4 circular');
    fc.assert(
      fc.property(circularValue, (value) => {
        const keysBefore = Object.keys(value);
        const node = redactGenericValue(value, null);
        expect(Object.keys(value)).toEqual(keysBefore);
        counter.add(hasMarker(node, '[circular reference]') ? 'marked' : 'unmarked');
        expect(JSON.stringify(node)).not.toContain(CANARY_PART);
      }),
      params('full'),
    );
    counter.print();
    // The cycle goes through a plain key (`self`, `child`, `back`), so a marker is always present.
    expect(counter.counts['unmarked'] ?? 0).toBe(0);
  }, PBT_TIMEOUT);

  it('terminates for input deeper than GENERIC_DEPTH and shows [nested too deep]', () => {
    fc.assert(
      fc.property(deepValue(), (value) => {
        const before = structuredClone(value);
        const node = redactGenericValue(value, null);
        expect(value).toEqual(before);
        expect(hasMarker(node, '[nested too deep]')).toBe(true);
      }),
      params('full'),
    );
  }, PBT_TIMEOUT);
});
