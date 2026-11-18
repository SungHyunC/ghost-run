import { describe, expect, it } from 'vitest';
import { tokenize, type Token } from '../src/shell/tokenize.js';

const w = (text: string, quoted = false, glob = false): Token => ({ kind: 'word', text, quoted, glob });
const op = (o: ';' | '&&' | '>' | '>>'): Token => ({ kind: 'op', op: o });
const bad = (reason: string): Token => ({ kind: 'bad', reason });

describe('tokenize: words, operators, quoting', () => {
  const cases: Array<[string, string, Token[]]> = [
    ['plain words', 'ls -la dir', [w('ls'), w('-la'), w('dir')]],
    ['empty line', '', []],
    ['only blanks', ' \t ', []],
    ['semicolon', 'a;b', [w('a'), op(';'), w('b')]],
    ['and-and', 'a && b', [w('a'), op('&&'), w('b')]],
    ['redirect', 'echo hi > f', [w('echo'), w('hi'), op('>'), w('f')]],
    ['append glued', 'echo hi>>f', [w('echo'), w('hi'), op('>>'), w('f')]],
    ['single quotes literal', "echo 'a b $x *'", [w('echo'), w('a b $x *', true)]],
    ['double quotes', 'echo "a  b"', [w('echo'), w('a  b', true)]],
    ['double quote escapes', 'echo "a\\"b\\\\c"', [w('echo'), w('a"b\\c', true)]],
    ['double quote keeps other backslash', 'echo "a\\nb"', [w('echo'), w('a\\nb', true)]],
    ['adjacent quoting joins one word', `a"b c"'d'e`, [w('ab cde', true)]],
    ['empty quoted word', "echo ''", [w('echo'), w('', true)]],
    ['quoted glob chars are not globs', "find . -name '*.log'", [w('find'), w('.'), w('-name'), w('*.log', true)]],
    ['unquoted glob star', 'rm *.log', [w('rm'), w('*.log', false, true)]],
    ['unquoted glob question', 'ls a?', [w('ls'), w('a?', false, true)]],
    ['unquoted glob bracket', 'ls [ab]', [w('ls'), w('[ab]', false, true)]],
    ['hash inside a word is literal', 'echo a#b', [w('echo'), w('a#b')]],
    ['hash in quotes is literal', "echo '#x'", [w('echo'), w('#x', true)]],
    ['escaped char is quoted', 'echo a\\*b', [w('echo'), w('a*b', true)]],
    ['digit word with space before >', 'echo 2 > f', [w('echo'), w('2'), op('>'), w('f')]],
    ['quoted digit glued to >', 'echo "2">f', [w('echo'), w('2', true), op('>'), w('f')]],
  ];
  it.each(cases)('%s', (_name, line, expected) => {
    expect(tokenize(line)).toEqual(expected);
  });
});

describe('tokenize: bad constructs with fixed reasons', () => {
  const cases: Array<[string, string, string]> = [
    ['pipe', 'a | b', 'pipe'],
    ['pipe glued', 'a|b', 'pipe'],
    ['or list', 'a || b', 'or list'],
    ['background', 'a &', 'background job'],
    ['input redirect', 'a < f', 'input redirection'],
    ['here document', 'a << EOF', 'here document'],
    ['open paren', '(a)', 'subshell'],
    ['close paren', 'a)', 'subshell'],
    ['open brace', '{ a; }', 'brace group'],
    ['close brace', 'a }', 'brace group'],
    ['dollar variable', 'echo $HOME', 'variable expansion'],
    ['dollar in double quotes', 'echo "$HOME"', 'variable expansion'],
    ['dollar command substitution', 'echo $(ls)', 'command substitution'],
    ['backtick', 'echo `ls`', 'command substitution'],
    ['backtick in double quotes', 'echo "`ls`"', 'command substitution'],
    ['hash at word start', 'ls # note', 'comment'],
    ['hash at line start', '#x', 'comment'],
    ['fd redirect', 'a 2>f', 'fd redirection'],
    ['fd redirect append', 'a 2>>f', 'fd redirection'],
    ['ampersand redirect', 'a &> f', 'fd redirection'],
    ['newline', 'a\nb', 'newline'],
    ['newline in single quotes', "echo 'a\nb'", 'newline'],
    ['trailing backslash', 'echo a\\', 'trailing backslash'],
    ['unterminated single quote', "echo 'abc", 'unterminated quote'],
    ['unterminated double quote', 'echo "abc', 'unterminated quote'],
    ['nul', 'echo a\u0000b', 'nul character'],
  ];
  it.each(cases)('%s', (_name, line, reason) => {
    expect(tokenize(line)).toContainEqual(bad(reason));
  });

  it('keeps the dollar literal inside single quotes', () => {
    expect(tokenize("echo '$HOME'")).toEqual([w('echo'), w('$HOME', true)]);
  });

  it('drops the digit word when it is glued to >, keeping the operator', () => {
    expect(tokenize('a 2>f')).toEqual([w('a'), bad('fd redirection'), op('>'), w('f')]);
  });

  it('counts a pipe once and does not mistake && for background', () => {
    expect(tokenize('a && b').filter((t) => t.kind === 'bad')).toEqual([]);
  });

  it('never throws on arbitrary code points', () => {
    for (const s of ['\ud800', '"', "'", '\\', '>', '&', '$', '\u0000', '😀"', '\\\n']) {
      expect(() => tokenize(s)).not.toThrow();
    }
  });
});
