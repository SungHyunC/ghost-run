import { describe, expect, it } from 'vitest';
import { fnmatch } from '../src/shell/fnmatch.js';

describe('fnmatch', () => {
  const cases: Array<[string, string, boolean]> = [
    ['*.log', 'a.log', true],
    ['*.log', '.log', true],
    ['*.log', 'a.txt', false],
    ['*.log', 'a.log.bak', false],
    ['*', '', true],
    ['*', 'anything', true],
    ['', '', true],
    ['', 'a', false],
    ['a?c', 'abc', true],
    ['a?c', 'ac', false],
    ['a?c', 'abbc', false],
    ['?', '\u{1F600}', true],
    ['[abc]x', 'bx', true],
    ['[abc]x', 'dx', false],
    ['[!abc]x', 'dx', true],
    ['[!abc]x', 'ax', false],
    ['[a-c]x', 'bx', true],
    ['[a-c]x', 'dx', false],
    ['[]a]', ']', true],
    ['[!]a]', 'b', true],
    ['[abc', '[abc', true],
    ['[abc', 'a', false],
    ['a*b*c', 'axxbyyc', true],
    ['a*b*c', 'axxbyy', false],
    ['*a*', 'bab', true],
    ['**a', 'a', true],
    ['*abab', 'ababab', true],
    ['file[0-9].txt', 'file7.txt', true],
    ['file[0-9].txt', 'filex.txt', false],
    ['a.b', 'axb', false],
  ];
  it.each(cases)('fnmatch(%j, %j) = %s', (pattern, name, expected) => {
    expect(fnmatch(pattern, name)).toBe(expected);
  });

  it('stays fast on a pathological pattern', () => {
    const name = 'a'.repeat(5000);
    expect(fnmatch('*a*a*a*a*a*a*a*b', name)).toBe(false);
  });
});
