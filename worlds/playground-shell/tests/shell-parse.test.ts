import { describe, expect, it } from 'vitest';
import { parseLine } from '../src/shell/parse.js';

describe('parseLine: supported shapes', () => {
  it('parses one simple command', () => {
    expect(parseLine('rm -rf data')).toEqual([{ words: ['rm', '-rf', 'data'], connector: null }]);
  });

  it('splits at ; and && and records the preceding connector', () => {
    expect(parseLine('a; b && c')).toEqual([
      { words: ['a'], connector: null },
      { words: ['b'], connector: ';' },
      { words: ['c'], connector: '&&' },
    ]);
  });

  it('allows a trailing ;', () => {
    expect(parseLine('a;')).toEqual([{ words: ['a'], connector: null }]);
    expect(parseLine('a; b ;')).toHaveLength(2);
  });

  it('extracts a redirect', () => {
    expect(parseLine('echo hi >> f')).toEqual([
      { words: ['echo', 'hi'], redirect: { op: '>>', target: 'f' }, connector: null },
    ]);
  });

  it('allows the redirect before the words', () => {
    const [c] = parseLine('> f echo hi');
    expect(c?.unsupportedReason).toBeUndefined();
    expect(c?.words).toEqual(['echo', 'hi']);
    expect(c?.redirect).toEqual({ op: '>', target: 'f' });
  });

  it('accepts quoted glob characters', () => {
    expect(parseLine("find . -name '*.log'")[0]?.unsupportedReason).toBeUndefined();
  });
});

describe('parseLine: unsupportedReason', () => {
  const cases: Array<[string, string, string]> = [
    ['bad token', 'a | b', 'pipe'],
    ['unquoted glob word', 'rm *.log', 'glob'],
    ['unquoted glob as redirect target', 'echo a > *.txt', 'glob'],
    ['two redirects', 'echo a > f > g', 'multiple redirections'],
    ['redirect and append', 'echo a > f >> g', 'multiple redirections'],
    ['redirect without target at end', 'echo a >', 'redirection without target'],
    ['redirect without target before ;', 'echo a > ; b', 'redirection without target'],
    ['redirect only, no words', '> f', 'no command'],
    ['empty line', '', 'empty command'],
    ['lone semicolon', ';', 'empty command'],
    ['empty segment between operators', 'a ;; b', 'empty command'],
    ['leading operator', '&& a', 'empty command'],
  ];
  it.each(cases)('%s', (_name, line, reason) => {
    const cmds = parseLine(line);
    const bad = cmds.find((c) => c.unsupportedReason !== undefined);
    expect(bad?.unsupportedReason).toBe(reason);
  });

  it('reports a trailing && on its own segment and keeps earlier commands clean', () => {
    const cmds = parseLine('a &&');
    expect(cmds).toHaveLength(2);
    expect(cmds[0]?.unsupportedReason).toBeUndefined();
    expect(cmds[1]).toMatchObject({ words: [], connector: '&&', unsupportedReason: 'trailing &&' });
  });

  it('marks only the offending segment', () => {
    const cmds = parseLine('a; b | c; d');
    expect(cmds.map((c) => c.unsupportedReason)).toEqual([undefined, 'pipe', undefined]);
  });

  it('flags more than 64 simple commands on the first segment', () => {
    const ok = Array.from({ length: 64 }, () => 'true').join(';');
    expect(parseLine(ok).every((c) => c.unsupportedReason === undefined)).toBe(true);
    const many = Array.from({ length: 65 }, () => 'true').join(';');
    expect(parseLine(many)[0]?.unsupportedReason).toBe('command line too long');
  });

  it('flags more than 4096 code points, counted as code points', () => {
    const atLimit = 'echo ' + 'x'.repeat(4096 - 5);
    expect(parseLine(atLimit)[0]?.unsupportedReason).toBeUndefined();
    expect(parseLine(atLimit + 'x')[0]?.unsupportedReason).toBe('command line too long');
    const emoji = 'echo ' + '\u{1F600}'.repeat(4091);
    expect(emoji.length).toBeGreaterThan(4096);
    expect(parseLine(emoji)[0]?.unsupportedReason).toBeUndefined();
  });
});
