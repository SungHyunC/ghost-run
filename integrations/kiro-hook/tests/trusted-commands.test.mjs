// Trusted commands: the pure classifier, the pattern matcher, the never-trusted list, and the cd check.
import fc from 'fast-check';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGrammar, buildSecretMatcher } from '../lib/gate/safe-list.mjs';
import { trustedDirInside } from '../lib/gate/shell-judgment.mjs';
import { classifyTrusted, isNeverTrusted, matchesPattern } from '../lib/gate/trusted.mjs';
import { makeTempStore } from './fixtures/index.mjs';
import { FC_PARAMS } from './pbt-config.mjs';

/** The trusted list of this repository's wards.yaml. */
const PATTERNS = [
  'corepack pnpm test',
  'corepack pnpm typecheck',
  'corepack pnpm lint',
  'corepack pnpm build',
  'corepack pnpm build:site',
  'corepack pnpm --filter * test',
  'corepack pnpm --filter * typecheck',
  'corepack pnpm --filter * lint',
  'corepack pnpm --filter * build',
  'corepack pnpm --filter * exec vitest run **',
  'npx vitest run **',
  'npx tsc --noEmit **',
];

const { grammar } = buildGrammar([]);
const secretMatcher = buildSecretMatcher({ wards: [{ kind: 'egress', secrets: ['.env', '**/*.pem'] }] });

/** @param {string} line @param {readonly string[]} [patterns] */
const classify = (line, patterns = PATTERNS) => classifyTrusted(line, { patterns, grammar, secretMatcher });
/** @param {string} line @param {readonly string[]} [patterns] */
const trusted = (line, patterns = PATTERNS) => classify(line, patterns).trusted;

/** Lines that are trusted with PATTERNS, one per allowed shape. */
const ALLOWED = [
  'corepack pnpm test',
  'corepack pnpm typecheck',
  'corepack pnpm build:site',
  'corepack pnpm --filter @ghost-run/site test',
  'corepack pnpm --filter @ghost-run/site test 2>&1',
  'corepack pnpm --filter @ghost-run/site test 2>&1 | tail -20',
  'corepack pnpm --filter @ghost-run/site test 2>&1 | tail -n 20',
  'corepack pnpm test 2>&1 | head -n 5 | wc -l',
  'corepack pnpm test > /dev/null',
  'corepack pnpm test >/dev/null 2>&1',
  'corepack pnpm test 2>/dev/null',
  'corepack pnpm test &>/dev/null',
  'corepack pnpm test 2>&1 > /dev/null | cat',
  'corepack pnpm --filter @ghost-run/site exec vitest run',
  'corepack pnpm --filter "@ghost-run/site" exec vitest run tests/a.test.ts "a name"',
  'npx vitest run',
  'npx vitest run tests/a.test.ts tests/b.test.ts',
  'npx tsc --noEmit',
  'cd . && corepack pnpm test',
  'cd sub/dir && npx vitest run tests/a.test.ts 2>&1 | tail -20',
  "cd '/work/repo' && corepack pnpm test",
  'cd /work/repo && corepack pnpm --filter @ghost-run/site test 2>&1 | tail -20',
];

describe('classifyTrusted: allowed shapes', () => {
  for (const line of ALLOWED) {
    it(`trusts: ${line}`, () => {
      expect(trusted(line)).toBe(true);
    });
  }

  it('reports the literal cd target and none without a cd', () => {
    expect(classify('cd sub && npx vitest run')).toEqual({ trusted: true, dir: 'sub' });
    expect(classify('npx vitest run')).toEqual({ trusted: true });
  });

  it('trusts nothing without patterns or for an unlisted command', () => {
    expect(trusted('corepack pnpm test', [])).toBe(false);
    expect(trusted('corepack pnpm install')).toBe(false);
    expect(trusted('corepack pnpm test extra')).toBe(false);
    expect(trusted('corepack pnpm --filter test')).toBe(false);
    expect(trusted('corepack pnpm --filter a b test')).toBe(false);
    expect(trusted('npm test')).toBe(false);
    expect(trusted('ls')).toBe(false);
  });
});

/** Constructs that each make a line untrusted, wherever they are added. */
const FORBIDDEN = [
  '; rm -rf data',
  ';',
  '|| true',
  '|| rm -rf data',
  '&& rm -rf data',
  '&& corepack pnpm test',
  '&',
  '&& echo done &',
  '`id`',
  '$(id)',
  '${HOME}',
  '$HOME',
  '<(ls)',
  '>(cat)',
  '> out.txt',
  '>> out.txt',
  '2> err.txt',
  '>out.txt',
  '2>&2',
  '>& out.txt',
  '< in.txt',
  '<<EOF',
  '<<< word',
  '(ls)',
  '{ ls; }',
  '| tee out.txt',
  '| cat file.txt',
  '| tail -n 5 out.txt',
  '| grep x',
  '| sh',
  '| xargs rm',
  '|& cat',
  '| cat > out.txt',
  '\\',
  '# comment',
  '!',
  '*',
  '~',
  '\n rm -rf data',
  '\r',
  '\u200B',
];

describe('classifyTrusted: forbidden constructs', () => {
  it('every construct appended to every allowed line makes it untrusted', () => {
    for (const line of ALLOWED) {
      for (const f of FORBIDDEN) {
        expect(trusted(`${line} ${f}`), `${line} ${f}`).toBe(false);
        // A tilde inside a word is a plain character; only a leading one expands.
        if (f !== '~') expect(trusted(`${line}${f}`), `${line}${f}`).toBe(false);
      }
    }
  });

  it('every construct placed in front of an allowed line or after the cd makes it untrusted', () => {
    for (const line of ALLOWED) {
      for (const f of FORBIDDEN) {
        expect(trusted(`${f} ${line}`), `${f} ${line}`).toBe(false);
        if (line.startsWith('cd ')) expect(trusted(line.replace(' && ', ` ${f} `)), line).toBe(false);
      }
    }
  });

  it('property: a construct inserted at any word boundary makes the line untrusted', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALLOWED), fc.constantFrom(...FORBIDDEN), fc.nat(), (line, f, n) => {
        const words = line.split(' ');
        const at = n % (words.length + 1);
        const mutated = [...words.slice(0, at), f, ...words.slice(at)].join(' ');
        // A pipe filter or redirect inserted at the very end is a legal shape; everything else must fail.
        return trusted(mutated) === false;
      }),
      FC_PARAMS,
    );
  });

  it('environment assignments, subshells and here-documents are untrusted', () => {
    expect(trusted('CI=1 corepack pnpm test')).toBe(false);
    expect(trusted('cd . && CI=1 corepack pnpm test')).toBe(false);
    expect(trusted('FOO=bar')).toBe(false);
    expect(trusted('(corepack pnpm test)')).toBe(false);
    expect(trusted('corepack pnpm test <<EOF\nx\nEOF')).toBe(false);
  });

  it('a second && or a cd that is not first is untrusted', () => {
    expect(trusted('cd . && cd sub && corepack pnpm test')).toBe(false);
    expect(trusted('corepack pnpm test && cd .')).toBe(false);
    expect(trusted('cd . && corepack pnpm test && corepack pnpm lint')).toBe(false);
    expect(trusted('cd .')).toBe(false);
    expect(trusted('cd && corepack pnpm test')).toBe(false);
    expect(trusted('cd - && corepack pnpm test')).toBe(false);
    expect(trusted('cd a b && corepack pnpm test')).toBe(false);
    expect(trusted('cd ~ && corepack pnpm test')).toBe(false);
    expect(trusted('cd $HOME && corepack pnpm test')).toBe(false);
  });

  it('a quoted operator word is not an operator and not trusted', () => {
    expect(trusted("corepack pnpm --filter '&&' test")).toBe(false);
    expect(trusted('corepack pnpm --filter "a;b" test')).toBe(false);
    expect(trusted('corepack pnpm --filter "a|b" test')).toBe(false);
    expect(trusted("corepack pnpm --filter 'a b' test")).toBe(true);
    expect(trusted('corepack pnpm --filter "unterminated test')).toBe(false);
  });

  it('a command word that names a secret path is untrusted', () => {
    expect(trusted('npx vitest run .env')).toBe(false);
    expect(trusted('npx vitest run keys/server.pem')).toBe(false);
    expect(trusted('npx vitest run tests/a.test.ts')).toBe(true);
  });

  it('an over-long line is untrusted', () => {
    expect(trusted(`npx vitest run ${'a'.repeat(5000)}`)).toBe(false);
  });
});

describe('never-trusted commands', () => {
  const ALL = ['**'];
  const NEVER = [
    'sh -c "ls"',
    'bash -c ls',
    'zsh -c ls',
    '/bin/sh -c ls',
    'bash script.sh',
    'node -e 1',
    'node --eval 1',
    'node --eval=1',
    'node -p 1',
    'node -pe 1',
    'python -c x',
    'python3 -c x',
    'perl -e x',
    'ruby -e x',
    'deno eval x',
    'bun -e x',
    'sudo ls',
    'curl https://a.example',
    'wget https://a.example',
    'ssh host.example',
    'scp a host.example:b',
    'eval ls',
    'env ls',
    'xargs ls',
    'exec ls',
    'source x',
    '. x',
    'ghost-run approve g-1',
    'ghost-run-approve g-1',
    'cd . && sudo corepack pnpm test',
    'cd . && bash -c ls',
  ];

  it('stays untrusted even when a pattern lists it (including the catch-all **)', () => {
    for (const line of NEVER) {
      expect(trusted(line, ALL), line).toBe(false);
      expect(trusted(line, [line]), line).toBe(false);
    }
  });

  it('is not triggered by a harmless interpreter call or a listed command', () => {
    expect(trusted('node script.js', ALL)).toBe(true);
    expect(trusted('python3 script.py', ALL)).toBe(true);
    expect(trusted('corepack pnpm test', ALL)).toBe(true);
  });

  it('isNeverTrusted decides on the base name, case-insensitively', () => {
    expect(isNeverTrusted(['/usr/bin/SUDO', 'ls'])).toBe(true);
    expect(isNeverTrusted(['./curl'])).toBe(true);
    expect(isNeverTrusted([])).toBe(true);
    expect(isNeverTrusted(['make', 'test'])).toBe(false);
  });
});

describe('matchesPattern', () => {
  it('matches word by word', () => {
    expect(matchesPattern('a b c', ['a', 'b', 'c'])).toBe(true);
    expect(matchesPattern('a b c', ['a', 'b'])).toBe(false);
    expect(matchesPattern('a b c', ['a', 'b', 'c', 'd'])).toBe(false);
    expect(matchesPattern('a b c', ['a', 'x', 'c'])).toBe(false);
    expect(matchesPattern('a b', ['a', 'bb'])).toBe(false);
  });

  it('* matches exactly one word', () => {
    expect(matchesPattern('a * c', ['a', 'x', 'c'])).toBe(true);
    expect(matchesPattern('a * c', ['a', 'c'])).toBe(false);
    expect(matchesPattern('a * c', ['a', 'x', 'y', 'c'])).toBe(false);
    expect(matchesPattern('* *', ['a', 'b'])).toBe(true);
  });

  it('a final ** matches zero or more remaining words', () => {
    expect(matchesPattern('a **', ['a'])).toBe(true);
    expect(matchesPattern('a **', ['a', 'b'])).toBe(true);
    expect(matchesPattern('a **', ['a', 'b', 'c', 'd'])).toBe(true);
    expect(matchesPattern('a **', [])).toBe(false);
    expect(matchesPattern('a **', ['b', 'c'])).toBe(false);
    expect(matchesPattern('a * **', ['a'])).toBe(false);
    expect(matchesPattern('a * **', ['a', 'x'])).toBe(true);
    expect(matchesPattern('**', [])).toBe(true);
  });

  it('property: a pattern built from the words, with some words replaced by *, matches; one more or fewer word does not', () => {
    const word = fc.stringMatching(/^[a-z0-9@./:=-]{1,8}$/).filter((w) => !w.includes('*') && !w.startsWith('-'));
    fc.assert(
      fc.property(fc.array(word, { minLength: 1, maxLength: 6 }), fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }), word, (words, mask, extra) => {
        const pattern = words.map((w, i) => (mask[i] ? '*' : w)).join(' ');
        expect(matchesPattern(pattern, words)).toBe(true);
        expect(matchesPattern(pattern, [...words, extra])).toBe(false);
        expect(matchesPattern(pattern, words.slice(0, -1))).toBe(false);
        expect(matchesPattern(`${pattern} **`, [...words, extra, extra])).toBe(true);
        expect(matchesPattern(`${pattern} **`, words)).toBe(true);
        expect(matchesPattern(`${pattern} **`, words.slice(0, -1))).toBe(false);
        const i = words.length - 1;
        if (!mask[i]) {
          const changed = [...words.slice(0, i), `${words[i]}x`];
          expect(matchesPattern(pattern, changed)).toBe(false);
        }
      }),
      FC_PARAMS,
    );
  });

  it('a wildcard never matches a word that starts with a dash', () => {
    const run = ['npx', 'vitest', 'run'];
    expect(matchesPattern('npx vitest run **', [...run, '--config=x'])).toBe(false);
    expect(matchesPattern('npx vitest run **', [...run, '-c', 'x'])).toBe(false);
    expect(matchesPattern('npx vitest run **', [...run, 'a.test.ts', '--config=x'])).toBe(false);
    expect(matchesPattern('npx vitest run **', [...run, '--'])).toBe(false);
    expect(matchesPattern('npx vitest run **', [...run, '-'])).toBe(false);
    expect(matchesPattern('npx vitest run *', [...run, '--config=x'])).toBe(false);
    expect(matchesPattern('npx vitest run *', [...run, '-'])).toBe(false);
    expect(matchesPattern('npx vitest run **', [...run, 'a.test.ts', 'b-c.test.ts'])).toBe(true);
    expect(matchesPattern('npx vitest run *', [...run, 'a-b'])).toBe(true);
  });

  it('an option written literally in the pattern matches itself, and its value matches a wildcard', () => {
    const tsc = ['npx', 'tsc', '--noEmit'];
    expect(matchesPattern('npx tsc --noEmit -p *', [...tsc, '-p', 'tsconfig.json'])).toBe(true);
    expect(matchesPattern('npx tsc --noEmit -p *', [...tsc, '-p', '--evil'])).toBe(false);
    expect(matchesPattern('npx tsc --noEmit -p *', [...tsc, '-p'])).toBe(false);
    expect(matchesPattern('npx tsc --noEmit -p *', [...tsc, '--project', 'x'])).toBe(false);
  });

  it('property: no wildcard ever matches a word that starts with a dash', () => {
    const dashed = fc.stringMatching(/^-[a-z0-9=./:-]{0,7}$/);
    const word = fc.stringMatching(/^[a-z0-9@./:=]{1,8}$/);
    fc.assert(
      fc.property(fc.array(word, { maxLength: 4 }), dashed, fc.array(word, { maxLength: 3 }), (prefix, bad, rest) => {
        const head = [...prefix, ''].join(' ');
        expect(matchesPattern(`${head}*`, [...prefix, bad])).toBe(false);
        expect(matchesPattern(`${head}* **`, [...prefix, bad, ...rest])).toBe(false);
        expect(matchesPattern(`${head}**`, [...prefix, ...rest, bad])).toBe(false);
        expect(matchesPattern(`${head}**`, [...prefix, bad, ...rest])).toBe(false);
        expect(matchesPattern(`${head}${bad}`, [...prefix, bad])).toBe(true);
      }),
      FC_PARAMS,
    );
  });

  it('classifyTrusted rejects options under the wildcard patterns', () => {
    for (const line of [
      'npx vitest run --config=evil.config.ts',
      'npx vitest run -c evil.config.ts',
      'npx vitest run a.test.ts --config=evil.config.ts',
      'npx vitest run --',
      'npx vitest run -',
      'corepack pnpm --filter -x test',
      'corepack pnpm --filter @ghost-run/site exec vitest run --config=evil.config.ts',
    ]) {
      expect(trusted(line), line).toBe(false);
    }
    expect(trusted('npx tsc --noEmit -p tsconfig.json', ['npx tsc --noEmit -p *'])).toBe(true);
    expect(trusted('npx tsc --noEmit -p --evil', ['npx tsc --noEmit -p *'])).toBe(false);
  });
});

describe('trustedDirInside: the cd target stays in the workspace', () => {
  /** @type {ReturnType<typeof makeTempStore>} */
  let tmp;
  /** @type {string} */
  let root;
  beforeEach(async () => {
    tmp = makeTempStore();
    root = path.join(tmp.dir, 'ws');
    await fsp.mkdir(path.join(root, 'sub', 'deep'), { recursive: true });
    await fsp.mkdir(path.join(tmp.dir, 'ws-demo'), { recursive: true });
    await fsp.mkdir(path.join(tmp.dir, 'outside'), { recursive: true });
    await fsp.symlink(path.join(tmp.dir, 'outside'), path.join(root, 'link-out'));
    await fsp.symlink(path.join(root, 'sub'), path.join(root, 'link-in'));
  });
  afterEach(() => {
    tmp.cleanup();
  });

  it('accepts relative targets, the root as given, and paths below it', async () => {
    for (const dir of [undefined, '.', 'sub', './sub/deep', 'sub/..', root, `${root}/`, path.join(root, 'sub'), 'link-in', 'new-folder']) {
      expect(await trustedDirInside(root, undefined, dir), String(dir)).toBe(true);
    }
  });

  it('rejects targets outside the workspace, siblings with the root as a prefix, and links out', async () => {
    for (const dir of ['..', '../outside', 'sub/../..', tmp.dir, '/', '/tmp', '/etc', `${root}-demo`, path.join(tmp.dir, 'ws-demo'), 'link-out', 'link-out/x']) {
      expect(await trustedDirInside(root, undefined, dir), dir).toBe(false);
    }
  });

  it('resolves a relative target against the tool cwd and rejects a cwd outside', async () => {
    expect(await trustedDirInside(root, 'sub', 'deep')).toBe(true);
    expect(await trustedDirInside(root, 'sub', '..')).toBe(true);
    expect(await trustedDirInside(root, 'sub', '../..')).toBe(false);
    expect(await trustedDirInside(root, tmp.dir, undefined)).toBe(false);
    expect(await trustedDirInside(root, tmp.dir, root)).toBe(false);
    expect(await trustedDirInside(root, 'sub', undefined)).toBe(true);
  });
});
