// Property test for safe-list soundness (task 5.4, KI-P2). No Docker needed [no-docker].
// Hidden code points are built from code points only; none appear literally in this file.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_GRAMMAR,
  buildGrammar,
  buildSecretMatcher,
  classifySafe,
} from '../lib/gate/safe-list.mjs';
import { FC_PARAMS, FILE_TIMEOUT_MS } from './pbt-config.mjs';

const wardSet = {
  wards: [{ id: 'egress-1', kind: 'egress', secrets: ['.env', '**/.env', '**/*.pem', '**/id_rsa'], allow_hosts: [] }],
};
const secrets = buildSecretMatcher(wardSet);

/** @param {string} line @param {readonly import('../lib/gate/safe-list.mjs').GrammarEntry[]} [grammar] */
const isSafe = (line, grammar = BUILTIN_GRAMMAR) => classifySafe(line, grammar, secrets).safe;

const NEWLINE = String.fromCodePoint(0x0a);
const CR = String.fromCodePoint(0x0d);
const BACKTICK = String.fromCodePoint(0x60);
const BACKSLASH = String.fromCodePoint(0x5c);

/** Safe base lines that the built-in grammar accepts (checked below). */
const SAFE_BASES = [
  'pwd',
  'ls',
  'ls -la src',
  'cat README.md',
  'head -n 5 README.md',
  'tail -n 20 src/a.txt',
  'wc -l README.md',
  'git status',
  'git diff',
  'git diff -- src/a.txt',
  'git log',
  'git log -- src',
  'git show',
  'git branch',
  'echo hello world',
];
const safeBase = fc.constantFrom(...SAFE_BASES);

// Bases that do not take free-form words (echo accepts any word and any dash word).
const NON_ECHO_BASES = SAFE_BASES.filter((b) => !b.startsWith('echo'));

const forbiddenChar = fc.constantFrom(';', '&', '|', '<', '>', BACKTICK, '$', BACKSLASH, NEWLINE, CR, String.fromCodePoint(0));

const HIDDEN_POINTS = [
  0x0000, 0x0009, 0x001f, 0x007f, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069, 0xe0000, 0xe0041, 0xe007f,
];
const hiddenChar = fc.constantFrom(...HIDDEN_POINTS).map((cp) => String.fromCodePoint(cp));

/** @param {string} base @param {string} s @param {number} at */
function insertAt(base, s, at) {
  const i = at % (base.length + 1);
  return base.slice(0, i) + s + base.slice(i);
}

const sprinkle = fc.nat({ max: 200 });

/** Lines with an injected forbidden char or hidden code point at any position. */
const injectedChar = fc
  .tuple(safeBase, fc.oneof(forbiddenChar, hiddenChar), sprinkle)
  .map(([b, c, at]) => insertAt(b, c, at));

/** Lines with an injected unquoted glob character, in a word of its own or attached to one. */
const injectedGlob = fc
  .tuple(safeBase, fc.constantFrom('*', '?', '[', '*.txt', 'a?', '[ab]'), fc.boolean())
  .map(([b, g, own]) => (own ? `${b} ${g}` : `${b}${g}`));

/** Lines with a leading-tilde word or a `..` segment. */
const injectedPathTrick = fc
  .tuple(
    fc.constantFrom('cat', 'head -n 3', 'tail', 'wc -l', 'ls', 'echo', 'git diff --', 'git log --'),
    fc.constantFrom('~', '~/x', '~root', '..', '../x', 'a/../b', 'a/..', '../../etc/passwd'),
  )
  .map(([cmd, w]) => `${cmd} ${w}`);

/** An unlisted option on a command whose grammar has no free words. */
const unlistedOption = fc
  .tuple(
    fc.constantFrom(...NON_ECHO_BASES),
    fc.constantFrom('--color', '--output=out', '-x', '-Z', '--no-pager', '-nope', '-n5', '-D', '--'),
  )
  .map(([b, o]) => {
    // `--` is only listed after `git diff`/`git log` once; a second one or one elsewhere is not safe.
    const withDash = b.includes(' -- ') ? `${b} -- ` : b;
    return `${withDash} ${o}`.replace(/\s+/g, ' ');
  })
  // A bare `--` after `git diff` or `git log` is part of the grammar.
  .filter((line) => !SAFE_BASES.includes(line) && line !== 'git log --' && line !== 'git diff --');

/** Commands outside the grammar, with or without arguments. */
const outsideGrammar = fc
  .tuple(
    fc.constantFrom(
      'rm', 'mv', 'cp', 'curl', 'wget', 'sh', 'bash', 'env', 'xargs', 'sudo', 'find', 'sed', 'awk', 'node',
      'python3', 'tee', 'dd', 'touch', 'mkdir', 'chmod', 'git push', 'git commit', 'git checkout', 'git reset',
      'git clean', 'ls2', 'LS', 'Cat', 'git', 'git statusx',
    ),
    fc.constantFrom('', ' x', ' -rf build', ' -c id', ' http://host.example/'),
  )
  .map(([c, a]) => `${c}${a}`);

/** A safe base with an appended chaining or redirect construct. */
const appended = fc
  .tuple(
    safeBase,
    fc.constantFrom(';', ' ;', '&&', ' && ls', '; rm x', ' | cat', '|', ' > out', '>out', ' >> out', ' < in', ' &', ' || ls'),
  )
  .map(([b, tail]) => `${b}${tail}`);

/** Secret-matching path words under the secret-checked commands. Case variants are included. */
const secretWord = fc.constantFrom(
  '.env', '.ENV', '.Env', './.env', 'a/.env', 'app/.ENV', 'keys/server.pem', 'KEYS/Server.PEM', 'x.pem', '.ssh/id_rsa',
  "'.env'", '".env"',
);
const secretLine = fc
  .tuple(fc.constantFrom('cat', 'head -n 3', 'tail -n 3', 'wc -l', 'git diff --'), secretWord)
  .map(([cmd, w]) => `${cmd} ${w}`);
const secretLineOther = fc.constantFrom('git show .env', 'git show keys/a.pem');

/** Unparsable lines: an unterminated quote after a safe base, a lone quote, or a `#` word. */
const unparsable = fc.oneof(
  fc.tuple(safeBase, fc.constantFrom("'", '"', "'abc", '"abc', "x 'y")).map(([b, q]) => `${b} ${q}`),
  fc.constantFrom('', ' ', '   ', "'", '"', '# ls', 'ls #x', 'echo #x', 'echo "unterminated'),
);

const FORBIDDEN_NAMES = [
  'sh', 'bash', 'zsh', 'dash', 'env', 'xargs', 'sudo', 'eval', 'exec', 'source', '.', 'find', 'awk', 'sed', 'tee', 'node',
  'python3', 'perl', 'curl', 'wget', 'ssh', 'rm', 'mv', 'cp', 'npx', 'pnpm', 'make', 'pwsh',
];
const caseVariant = (/** @type {string} */ s, /** @type {boolean} */ up) => (up ? s.toUpperCase() : s);

/** Extension entries with forbidden command names (any case), in several shapes. */
const forbiddenExtension = fc
  .tuple(
    fc.constantFrom(...FORBIDDEN_NAMES),
    fc.boolean(),
    fc.constantFrom('none', 'words', 'after--'),
    fc.constantFrom(undefined, 'words'),
    fc.constantFrom('', ' x', ' arg1 arg2', ' -- x'),
  )
  .map(([n, up, paths, extra, args]) => {
    const name = caseVariant(n, up);
    return { entry: { name: [name], options: [], paths, ...(extra ? { extra } : {}) }, line: `${name}${args}` };
  });

/** Extension entries whose name contains a forbidden character: never accepted, and the line is not safe. */
const badNameExtension = fc
  .tuple(fc.constantFrom(';', '&', '|', '<', '>', BACKTICK, '$', BACKSLASH, ' ', '/', '*', '~', "'"), fc.constantFrom('a', 'tool'))
  .map(([c, base]) => {
    const name = `${base}${c}x`;
    return { entry: { name: [name], options: [], paths: 'words' }, line: `${name} y` };
  });

/** A valid extension entry plus a line that breaks the shared rules (forbidden char, hidden point, glob, `..`, secret). */
const validExtension = fc
  .tuple(
    fc.constantFrom('mytool', 'lint-check', 'gitx', 'show-env'),
    fc.constantFrom('none', 'words', 'after--'),
    fc.constantFrom(undefined, 'words'),
  )
  .map(([n, paths, extra]) => ({ name: [n], options: ['-v'], paths, ...(extra ? { extra } : {}) }));

const extensionViolation = fc
  .tuple(validExtension, fc.oneof(forbiddenChar, hiddenChar), sprinkle, fc.constantFrom('x', 'a/b', '-v'))
  .map(([entry, c, at, arg]) => ({ entry, line: insertAt(`${entry.name[0]} ${arg}`, c, at) }));

const extensionSecret = validExtension
  .chain((entry) =>
    secretWord.map((w) => ({
      entry,
      line: entry.paths === 'after--' ? `${entry.name[0]} -- ${w}` : `${entry.name[0]} ${w}`,
      pathsAllowed: entry.paths !== 'none',
    })),
  );

const extensionGlobDots = fc
  .tuple(validExtension, fc.constantFrom('*', 'a?', '[x]', '~', '~/x', '..', '../x', 'a/../b'))
  .map(([entry, w]) => ({ entry, line: entry.paths === 'after--' ? `${entry.name[0]} -- ${w}` : `${entry.name[0]} ${w}` }));

/** Extension entries with a malformed shape (non-array safeCommands, junk entries, too many words). */
const junkExtension = fc.constantFrom(
  null,
  undefined,
  'ls',
  42,
  {},
  [null],
  [42],
  ['rm'],
  [{}],
  [{ name: [] }],
  [{ name: ['a', 'b', 'c'], paths: 'none' }],
  [{ name: ['x'], paths: 'anywhere' }],
  [{ name: ['x'], paths: 'words', options: ['bad option'] }],
  [{ name: ['x'], paths: 'words', extra: 'regex' }],
  [{ name: [''], paths: 'words' }],
  [{ name: ['-x'], paths: 'words' }],
  [{ name: ['#x'], paths: 'words' }],
);

/**
 * Run a property and count the predicate calls.
 * @template T
 * @param {fc.Arbitrary<T>} arb
 * @param {(v: T) => void} check
 */
function runProperty(arb, check) {
  let runs = 0;
  fc.assert(
    fc.property(arb, (v) => {
      runs += 1;
      check(v);
    }),
    FC_PARAMS,
  );
  return runs;
}

/** @type {Record<string, number>} */
const executed = {};

describe('Property 2: Safe-list soundness (KI-P2)', { timeout: FILE_TIMEOUT_MS }, () => {
  it('base lines are safe, so every injected variant starts from a safe line', () => {
    for (const b of SAFE_BASES) expect(isSafe(b), b).toBe(true);
  });

  // Feature: kiro-integration, Property 2: Safe-list soundness
  // **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.10**
  it('an injected forbidden character, hidden code point, glob, tilde, or dot-dot segment is never safe', () => {
    executed['char'] = runProperty(injectedChar, (line) => expect(isSafe(line), JSON.stringify(line)).toBe(false));
    executed['glob'] = runProperty(injectedGlob, (line) => expect(isSafe(line), JSON.stringify(line)).toBe(false));
    executed['path'] = runProperty(injectedPathTrick, (line) => expect(isSafe(line), JSON.stringify(line)).toBe(false));
  });

  // Feature: kiro-integration, Property 2: Safe-list soundness
  // **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.10**
  it('an unlisted option, a word outside the grammar, or an appended chain or redirect is never safe', () => {
    executed['option'] = runProperty(unlistedOption, (line) => expect(isSafe(line), JSON.stringify(line)).toBe(false));
    executed['outside'] = runProperty(outsideGrammar, (line) => expect(isSafe(line), JSON.stringify(line)).toBe(false));
    executed['appended'] = runProperty(appended, (line) => expect(isSafe(line), JSON.stringify(line)).toBe(false));
  });

  // Feature: kiro-integration, Property 2: Safe-list soundness
  // **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.10**
  it('a secret-matching path word is never safe under cat, head, tail, wc, git show, or git diff --', () => {
    executed['secret'] = runProperty(fc.oneof(secretLine, secretLineOther), (line) =>
      expect(isSafe(line), JSON.stringify(line)).toBe(false),
    );
  });

  // Feature: kiro-integration, Property 2: Safe-list soundness
  // **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.10**
  it('an unparsable line is never safe', () => {
    executed['unparsable'] = runProperty(unparsable, (line) => expect(isSafe(line), JSON.stringify(line)).toBe(false));
  });

  // Feature: kiro-integration, Property 2: Safe-list soundness
  // **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.10**
  it('extension entries cannot make an excluded command safe', () => {
    executed['extForbiddenName'] = runProperty(fc.oneof(forbiddenExtension, badNameExtension), ({ entry, line }) => {
      const { grammar } = buildGrammar([entry]);
      expect(isSafe(line, grammar), JSON.stringify(line)).toBe(false);
    });
    executed['extViolation'] = runProperty(extensionViolation, ({ entry, line }) => {
      const { grammar } = buildGrammar([entry]);
      expect(isSafe(line, grammar), JSON.stringify(line)).toBe(false);
    });
    executed['extSecret'] = runProperty(extensionSecret, ({ entry, line, pathsAllowed }) => {
      const { grammar } = buildGrammar([entry]);
      // An entry with `paths: none` and free words is echo-like: its words are text, not paths.
      if (pathsAllowed) expect(isSafe(line, grammar), JSON.stringify(line)).toBe(false);
    });
    executed['extGlobDots'] = runProperty(extensionGlobDots, ({ entry, line }) => {
      const { grammar } = buildGrammar([entry]);
      expect(isSafe(line, grammar), JSON.stringify(line)).toBe(false);
    });
    executed['extJunk'] = runProperty(junkExtension, (junk) => {
      const { grammar } = buildGrammar(junk);
      // An unparsable or invalid extension adds nothing: unlisted commands stay not safe.
      expect(isSafe('rm x', grammar)).toBe(false);
      expect(isSafe('x y', grammar)).toBe(false);
      expect(isSafe('', grammar)).toBe(false);
    });
  });

  // Regression: an extension entry with `paths: words` and `extra: words` skipped the secret check on its
  // free words (shrunk counterexample: entry { name: ['mytool'], options: ['-v'], paths: 'words', extra: 'words' },
  // line 'mytool ./.env').
  it.each([
    [{ name: ['mytool'], options: ['-v'], paths: 'words', extra: 'words' }, 'mytool ./.env'],
    [{ name: ['show-env'], options: ['-v'], paths: 'words', extra: 'words' }, 'show-env a/.env'],
    [{ name: ['mytool'], options: ['-v'], paths: 'after--', extra: 'words' }, 'mytool -- .env'],
  ])('regression: extension with free words still checks secret paths (%j)', (entry, line) => {
    const { grammar } = buildGrammar([entry]);
    expect(isSafe(line, grammar)).toBe(false);
  });

  it('reports the number of runs executed per property', () => {
    console.log(`KI-P2 runs executed: ${JSON.stringify(executed)} (numRuns=${FC_PARAMS.numRuns})`);
    for (const n of Object.values(executed)) expect(n).toBeGreaterThanOrEqual(FC_PARAMS.numRuns);
  });
});
