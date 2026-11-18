// Example tests for the provenance record format.
// **Validates: Requirements 8.6, 8.7**

import { describe, expect, it } from 'vitest';
import { parseProvenanceLog, serializeProvenanceLog } from '../../src/possession/provenance.js';

function errorsOf(text: string) {
  const result = parseProvenanceLog(text);
  if (result.ok) throw new Error('expected parse failure');
  return result.errors;
}

describe('parseProvenanceLog', () => {
  it('accepts the empty array', () => {
    expect(parseProvenanceLog('[]')).toEqual({ ok: true, log: [] });
  });

  it('round-trips a small log', () => {
    const log = [
      { source: 'README.md', kind: 'file' as const, content: 'hello' },
      { source: 'https://docs.example/a', kind: 'web' as const, content: '' },
    ];
    expect(parseProvenanceLog(serializeProvenanceLog(log))).toEqual({ ok: true, log });
  });

  it('rejects a __proto__ key as an unknown field and names index and field', () => {
    const text = '[{"source":"a","kind":"file","content":"x"},{"__proto__":{"x":1},"source":"b","kind":"file","content":"y"}]';
    const errors = errorsOf(text);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ index: 1, field: '__proto__' });
    expect(Object.prototype).not.toHaveProperty('x');
  });

  it('names the index and field of an empty source', () => {
    const errors = errorsOf('[{"source":"","kind":"file","content":"x"}]');
    expect(errors[0]).toMatchObject({ index: 0, field: 'source' });
  });

  it('names the index and field of a bad kind', () => {
    const errors = errorsOf(
      '[{"source":"a","kind":"file","content":""},{"source":"b","kind":"mail","content":""}]',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ index: 1, field: 'kind' });
  });

  it('names the index and field of non-string content', () => {
    const errors = errorsOf('[{"source":"a","kind":"web","content":5}]');
    expect(errors[0]).toMatchObject({ index: 0, field: 'content' });
  });

  it('names the field of an unknown extra field', () => {
    const errors = errorsOf('[{"source":"a","kind":"web","content":"","extra":1}]');
    expect(errors[0]).toMatchObject({ index: 0, field: 'extra' });
  });

  it('returns no partial log when any record is invalid', () => {
    const result = parseProvenanceLog('[{"source":"a","kind":"file","content":""},{"kind":"file"}]');
    expect(result.ok).toBe(false);
    expect('log' in result).toBe(false);
  });

  it('reports invalid JSON without throwing', () => {
    const errors = errorsOf('{not json');
    expect(errors[0]?.message).toMatch(/invalid JSON/);
    expect(errors[0]?.index).toBeUndefined();
  });

  it('reports a non-array top level as a top-level error', () => {
    const errors = errorsOf('{}');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.index).toBeUndefined();
  });
});
