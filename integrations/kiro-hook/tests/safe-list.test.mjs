import { describe, expect, it } from 'vitest';
import {
  BUILTIN_GRAMMAR,
  buildGrammar,
  buildSecretMatcher,
  classifySafe,
  tokenize,
  validateExtensionEntry,
} from '../lib/gate/safe-list.mjs';

const wardSet = {
  wards: [{ id: 'egress-1', kind: 'egress', secrets: ['.env', '**/.env', '**/*.pem'], allow_hosts: [] }],
};
const secrets = buildSecretMatcher(wardSet);
/** @type {(line: string, grammar?: readonly import('../lib/gate/safe-list.mjs').GrammarEntry[]) => boolean} */
const safe = (line, grammar = BUILTIN_GRAMMAR) => classifySafe(line, grammar, secrets).safe;

describe('safe-list built-in entries', () => {
  it.each([
    'pwd',
    'ls',
    'ls -la src',
    'ls -a -l docs/readme.md',
    'cat README.md',
    'head -n 5 README.md',
    'tail -n 20 src/a.txt',
    'wc -l README.md',
    'wc -w -c README.md',
    'git status',
    'git diff',
    'git diff -- src/a.txt',
    'git log',
    'git log -- src',
    'git show',
    'git branch',
    'echo hello world',
    "echo 'a b' \"c d\"",
  ])('safe: %s', (line) => {
    expect(safe(line)).toBe(true);
  });

  it.each([
    '',
    'rm -rf build',
    'pwd extra',
    'git push',
    'git',
    'git branch -D x',
    'git diff --output=out',
    'git log --output=out',
    'git diff src/a.txt',
    'ls --color',
    'head -n x file',
    'head -n',
    'head -n5 file',
    'ls; rm x',
    'ls && rm x',
    'ls | cat',
    'ls > out',
    'cat < in',
    'echo `id`',
    'echo $HOME',
    'echo $(id)',
    'echo a\\b',
    'ls *.txt',
    'ls ?',
    'ls [a]',
    'ls ~',
    'cat ../x',
    'cat a/../../x',
    'echo #x',
    "echo 'unterminated",
    'echo "unterminated',
    'ls \n rm x',
    'ls\rrm',
    'ls\u0000',
    'echo a\u200Bb',
    'echo a\u202Eb',
    'echo \u{E0041}',
    'echo a\uFEFF',
    'ls &',
  ])('not safe: %j', (line) => {
    expect(safe(line)).toBe(false);
  });

  it('quoted glob characters are literal and safe', () => {
    expect(safe("echo '*'")).toBe(true);
  });

  it('cat of a secret path is not safe with the default egress ward', () => {
    expect(safe('cat .env')).toBe(false);
    expect(safe('cat sub/.ENV')).toBe(false);
    expect(safe('tail -n 3 certs/key.pem')).toBe(false);
    expect(safe('wc -l .env')).toBe(false);
    expect(safe('git diff -- .env')).toBe(false);
    expect(safe('cat ./.env')).toBe(false);
  });

  it('fails closed when path words need a secret matcher and none is given', () => {
    expect(classifySafe('cat a.txt', BUILTIN_GRAMMAR, undefined).safe).toBe(false);
    expect(classifySafe('pwd', BUILTIN_GRAMMAR, undefined).safe).toBe(true);
  });

  it('returns not safe for non-string input', () => {
    expect(classifySafe(/** @type {any} */ (null), BUILTIN_GRAMMAR, secrets).safe).toBe(false);
    expect(classifySafe('pwd', /** @type {any} */ (null), secrets).safe).toBe(false);
  });
});

describe('tokenize', () => {
  it('splits words and handles quotes', () => {
    expect(tokenize("a 'b c' \"d e\"f")).toEqual({ ok: true, words: ['a', 'b c', 'd ef'], globs: [false, false, false] });
  });
  it('reports an unterminated quote as not ok', () => {
    expect(tokenize("a 'b")).toEqual({ ok: false });
  });
});

describe('extension entries', () => {
  it('accepts a valid extension entry under the same steps', () => {
    const { grammar, rejected } = buildGrammar([{ name: ['git', 'remote'], options: ['-v'], paths: 'none' }]);
    expect(rejected).toBe(0);
    expect(safe('git remote -v', grammar)).toBe(true);
    expect(safe('git remote -v; rm x', grammar)).toBe(false);
    expect(safe('git remote add x', grammar)).toBe(false);
  });

  it('rejects an entry named sh at load and never matches it', () => {
    /** @type {import('../lib/gate/safe-list.mjs').GrammarEntry} */
    const entry = { name: ['sh'], options: [], paths: 'words', extra: 'words' };
    expect(validateExtensionEntry(entry).length).toBeGreaterThan(0);
    const { grammar, rejected } = buildGrammar([entry]);
    expect(rejected).toBe(1);
    expect(safe('sh script.sh', grammar)).toBe(false);
    // Even a grammar array that bypasses buildGrammar cannot make sh safe.
    expect(safe('sh script.sh', [...BUILTIN_GRAMMAR, entry])).toBe(false);
  });

  it('an extension entry cannot make a secret read safe', () => {
    const { grammar } = buildGrammar([{ name: ['bat'], options: [], paths: 'words' }]);
    expect(safe('bat src/a.txt', grammar)).toBe(true);
    expect(safe('bat .env', grammar)).toBe(false);
  });

  it('drops malformed entries', () => {
    expect(buildGrammar([null, { name: [] }, { name: ['x'], paths: 'bogus' }]).rejected).toBe(3);
  });
});

describe('hidden characters (decided by core scanText plus a control check)', () => {
  const hidden = [0x200b, 0x200c, 0x2060, 0xfeff, 0x202e, 0x2066, 0xe0041, 0x0000, 0x0009, 0x000a, 0x000d, 0x001b, 0x007f];
  for (const cp of hidden) {
    const label = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
    it(`rejects ${label} in a command line`, () => {
      expect(safe('ls ' + String.fromCodePoint(cp) + 'src')).toBe(false);
      expect(safe('echo hi' + String.fromCodePoint(cp))).toBe(false);
    });
    it(`rejects ${label} in an extension command name`, () => {
      expect(validateExtensionEntry({ name: ['b' + String.fromCodePoint(cp) + 'at'], options: [], paths: 'none' }).length).toBeGreaterThan(0);
    });
  }
  it('still accepts a plain line', () => {
    expect(safe('ls -la src')).toBe(true);
  });
});
