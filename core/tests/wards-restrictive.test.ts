// Feature: wards, task 4.5: isMoreRestrictive with normalized keys and case_sensitive.
// **Validates: Requirements 15.2, 15.3, 15.4**
import { describe, expect, it } from 'vitest';
import { isMoreRestrictive } from '../src/index.js';
import type { Ward, WardSet } from '../src/index.js';

const set = (...wards: Ward[]): WardSet => ({ wards });

const pathWard = (paths: string[], case_sensitive?: boolean): Ward => ({
  id: 'p',
  kind: 'path',
  deny: ['delete'],
  paths,
  ...(case_sensitive === undefined ? {} : { case_sensitive }),
});
const sqlWard = (tables: string[], max = 0): Ward => ({
  id: 's',
  kind: 'sql',
  tables,
  max_rows_lost: max,
});
const egressWard = (secrets: string[], hosts: string[]): Ward => ({
  id: 'e',
  kind: 'egress',
  secrets,
  allow_hosts: hosts,
});

describe('isMoreRestrictive normalized keys', () => {
  it('path spellings of one pattern are one entry', () => {
    expect(isMoreRestrictive(set(pathWard(['data'])), set(pathWard(['./data/'])))).toBe(false);
    expect(isMoreRestrictive(set(pathWard(['./data/'])), set(pathWard(['data', 'data/']))))
      .toBe(false);
    expect(isMoreRestrictive(set(pathWard(['./data/'])), set(pathWard(['data', 'logs']))))
      .toBe(true);
  });

  it('path patterns are not case folded', () => {
    expect(isMoreRestrictive(set(pathWard(['Data'])), set(pathWard(['data'])))).toBe(false);
  });

  it('secrets are normalized', () => {
    expect(isMoreRestrictive(set(egressWard(['./.env'], [])), set(egressWard(['.env'], []))))
      .toBe(false);
    expect(
      isMoreRestrictive(set(egressWard(['./.env'], [])), set(egressWard(['.env', 'a/.env'], []))),
    ).toBe(true);
  });

  it('allow_hosts spellings compare by host key; revoking is tighter', () => {
    const a = set(egressWard(['.env'], ['Registry.NPMJS.org.']));
    expect(isMoreRestrictive(a, set(egressWard(['.env'], ['registry.npmjs.org'])))).toBe(false);
    expect(isMoreRestrictive(a, set(egressWard(['.env'], [])))).toBe(true);
    expect(isMoreRestrictive(set(egressWard(['.env'], [])), a)).toBe(false);
  });

  it('sql tables compare by ASCII lower case', () => {
    expect(isMoreRestrictive(set(sqlWard(['Users'])), set(sqlWard(['users'])))).toBe(false);
    expect(isMoreRestrictive(set(sqlWard(['Users'])), set(sqlWard(['users', 'orders'])))).toBe(
      true,
    );
  });
});

describe('isMoreRestrictive case_sensitive', () => {
  it('true to absent or false is tighter', () => {
    expect(isMoreRestrictive(set(pathWard(['a'], true)), set(pathWard(['a'])))).toBe(true);
    expect(isMoreRestrictive(set(pathWard(['a'], true)), set(pathWard(['a'], false)))).toBe(true);
  });

  it('absent or false to true is looser', () => {
    expect(isMoreRestrictive(set(pathWard(['a'])), set(pathWard(['a'], true)))).toBe(false);
    expect(isMoreRestrictive(set(pathWard(['a'], false)), set(pathWard(['a'], true)))).toBe(
      false,
    );
  });

  it('absent equals false', () => {
    expect(isMoreRestrictive(set(pathWard(['a'])), set(pathWard(['a'], false)))).toBe(false);
    expect(isMoreRestrictive(set(pathWard(['a'], false)), set(pathWard(['a'])))).toBe(false);
  });

  it('a tightening on one axis does not hide a loosening on another', () => {
    expect(isMoreRestrictive(set(pathWard(['a', 'b'], true)), set(pathWard(['a'])))).toBe(false);
  });
});

describe('isMoreRestrictive incompleteness', () => {
  it('returns false for pairs that are tighter but not by containment', () => {
    expect(isMoreRestrictive(set(pathWard(['data/**'])), set(pathWard(['data/**', 'data/x']))))
      .toBe(true); // extra key is a tightening
    expect(
      isMoreRestrictive(set(egressWard(['.env'], ['*.example.test'])), set(egressWard(['.env'], ['a.example.test']))),
    ).toBe(false);
    expect(
      isMoreRestrictive(set(egressWard(['.env'], ['a.example.test'])), set(egressWard(['.env'], ['a.example.test:8080']))),
    ).toBe(false);
  });
});
