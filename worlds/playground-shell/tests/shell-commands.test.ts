import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runLine, type LineResult, type RunEnv } from '../src/shell/interpret.js';
import { ACTION_COMMAND_BUDGET } from '../src/shell/limits.js';
import type { Entry, PlaygroundState } from '../src/state.js';
import { StateFs } from '../src/vfs/mutable-fs.js';
import { arbProjectAndLine } from './support/arb-commands.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { makeTestEnv } from './support/env.js';
import './support/setup.js';

const enc = new TextEncoder();
const f = (text: string): Entry => ({ kind: 'file', bytes: enc.encode(text) });
const d: Entry = { kind: 'dir' };

const base = (): Record<string, Entry> => ({
  a: d,
  'a/x.txt': f('xx'),
  'a/b': d,
  'a/b/y.log': f('y'),
  'a/.hid': f('h'),
  'z.txt': f('zed\n'),
  'e.txt': f(''),
});

interface Ctx {
  fs: StateFs;
  env: RunEnv;
  reads: string[];
}

function ctx(entries: Record<string, Entry> = base(), cwd = ''): Ctx {
  const reads: string[] = [];
  const { fs, env } = makeTestEnv(entries, {
    cwd,
    reads,
    sql: { run: () => Promise.reject(new Error('sql is not used in this file')) },
  });
  return { fs, env, reads };
}

async function run(line: string, c: Ctx = ctx()): Promise<LineResult & { c: Ctx }> {
  const r = await runLine(line, c.env);
  return { ...r, c };
}

const paths = (c: Ctx): string[] => c.fs.walk('');
const text = (c: Ctx, p: string): string => {
  const e = c.fs.get(p);
  return e?.kind === 'file' ? new TextDecoder().decode(e.bytes) : '<none>';
};

describe('table: exit code, stdout, stderr', () => {
  const cases: Array<[string, number, string, string?]> = [
    ['pwd', 0, '/\n'],
    ['true', 0, ''],
    ['false', 1, ''],
    ['echo hi there', 0, 'hi there\n'],
    ['echo -n hi', 0, 'hi'],
    ["echo '-n' hi", 0, 'hi'],
    ['echo -5', 0, '-5\n'],
    ['ls', 0, 'a\ne.txt\nz.txt\n'],
    ['ls -a', 0, '.\n..\na\ne.txt\nz.txt\n'],
    ['ls -l', 0, 'd 0 a\n- 0 e.txt\n- 4 z.txt\n'],
    ['ls a', 0, 'b\nx.txt\n'],
    ['ls -a a', 0, '.\n..\n.hid\nb\nx.txt\n'],
    ['ls z.txt', 0, 'z.txt\n'],
    ['ls a z.txt', 0, 'a:\nb\nx.txt\nz.txt\n'],
    ['ls a a/b', 0, 'a:\nb\nx.txt\n\na/b:\ny.log\n'],
    ['cat z.txt a/x.txt', 0, 'zed\nxx'],
    ['cat a', 1, ''],
    ['cat nope', 1, ''],
    ['mkdir a', 1, ''],
    ['mkdir n/m', 1, ''],
    ['mkdir -p n/m', 0, ''],
    ['mkdir -p a', 0, ''],
    ['mkdir -p z.txt/q', 1, ''],
    ['touch z.txt new.txt', 0, ''],
    ['touch n/x', 1, ''],
    ['rm nope', 1, ''],
    ['rm -f nope', 0, ''],
    ['rm a', 1, ''],
    ['rm -r a', 0, ''],
    ['rm -rf .', 1, ''],
    ['rm -rf /', 1, ''],
    ['rm -rf a/..', 1, ''],
    ['rm -r a/.', 1, ''],
    ['mv nope b', 1, ''],
    ['mv a a/b', 1, ''],
    ['mv z.txt z.txt', 1, ''],
    ['cp a b', 1, ''],
    ['cp -r a a/b', 1, ''],
    ['cp z.txt z.txt', 1, ''],
    ['mv z.txt', 1, ''],
    ['find nope', 1, ''],
    ['cat ../x', 1, ''],
    ['cat ~/x', 1, ''],
    ['echo a > nodir/f', 1, ''],
    ['echo a > a', 1, ''],
    ['false && echo no', 1, ''],
    ['false; echo yes', 0, 'yes\n'],
    ['true && echo yes', 0, 'yes\n'],
  ];
  it.each(cases)('%s', async (line, code, out) => {
    const r = await run(line);
    expect(r.exitCode).toBe(code);
    expect(r.stdout).toBe(out);
    expect(r.unsupportedReason).toBeUndefined();
  });
});

describe('table: state effects', () => {
  it('touch creates an empty file and leaves an existing one alone', async () => {
    const r = await run('touch new.txt z.txt');
    expect(text(r.c, 'new.txt')).toBe('');
    expect(text(r.c, 'z.txt')).toBe('zed\n');
  });

  it('mkdir -p creates every ancestor', async () => {
    const r = await run('mkdir -p p/q/r');
    expect(paths(r.c)).toEqual(expect.arrayContaining(['p', 'p/q', 'p/q/r']));
  });

  it.each(['rm -rf a', 'rm -fr a', 'rm -r a', 'rm -r -f a'])('%s removes the tree', async (line) => {
    const r = await run(line);
    expect(r.exitCode).toBe(0);
    expect(paths(r.c)).toEqual(['e.txt', 'z.txt']);
  });

  it('mv into an existing directory and onto a file', async () => {
    const a = await run('mv z.txt a');
    expect(text(a.c, 'a/z.txt')).toBe('zed\n');
    expect(a.c.fs.get('z.txt')).toBeUndefined();
    const b = await run('mv z.txt e.txt');
    expect(text(b.c, 'e.txt')).toBe('zed\n');
  });

  it('mv moves a directory with its tables', async () => {
    const c = ctx({ ...base(), 'a/db.sqlite': { kind: 'file', bytes: enc.encode('S'), tables: { t: 3 } } });
    await run('mv a q', c);
    expect(c.fs.get('q/db.sqlite')).toMatchObject({ kind: 'file', tables: { t: 3 } });
    expect(c.fs.get('a')).toBeUndefined();
    expect(c.fs.get('q/b/y.log')).toBeDefined();
  });

  it('cp -r copies a tree and records secret reads per source file', async () => {
    const r = await run('cp -r a c');
    expect(text(r.c, 'c/b/y.log')).toBe('y');
    expect(r.c.fs.get('a/b/y.log')).toBeDefined();
    expect(r.c.reads.sort()).toEqual(['a/.hid', 'a/b/y.log', 'a/x.txt']);
  });

  it('cp into an existing directory uses the source name', async () => {
    const r = await run('cp z.txt a');
    expect(text(r.c, 'a/z.txt')).toBe('zed\n');
  });

  it('cat records the read of each file but not of a failed one', async () => {
    const r = await run('cat z.txt nope a');
    expect(r.c.reads).toEqual(['z.txt']);
  });

  it('commands resolve against cwd', async () => {
    const c = ctx(base(), 'a');
    const r = await run('ls; pwd; cat x.txt', c);
    expect(r.stdout).toBe('b\nx.txt\n/a\nxx');
  });
});

describe('find', () => {
  it('prints depth-first in code-point order, with the path as written', async () => {
    expect((await run('find a')).stdout).toBe('a\na/.hid\na/b\na/b/y.log\na/x.txt\n');
    expect((await run('find . -print')).stdout).toContain('./a/b/y.log\n');
    expect((await run('find a/ -name "*.txt"')).stdout).toBe('a/x.txt\n');
  });

  it('-name matches the basename, including the start path', async () => {
    expect((await run('find a -name a')).stdout).toBe('a\n');
    expect((await run('find . -name "[xz]*"')).stdout).toBe('./a/x.txt\n./z.txt\n');
  });

  it('-delete is post-order and removes matching entries', async () => {
    const r = await run('find a -delete');
    expect(r.exitCode).toBe(0);
    expect(r.c.fs.get('a')).toBeUndefined();
    const s = await run('find a -name "*.log" -delete');
    expect(s.c.fs.get('a/b/y.log')).toBeUndefined();
    expect(s.c.fs.get('a/x.txt')).toBeDefined();
  });

  it('-delete keeps a matching directory that is not empty and exits 1', async () => {
    const r = await run('find a -name "b" -delete');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Directory not empty');
    expect(r.c.fs.get('a/b/y.log')).toBeDefined();
  });

  it('-delete at the root never removes the root itself', async () => {
    const r = await run('find . -delete');
    expect(r.exitCode).toBe(0);
    expect(paths(r.c)).toEqual([]);
  });
});

describe('redirects', () => {
  it('> truncates before the command runs and writes stdout after', async () => {
    const r = await run('cat z.txt > z.txt');
    expect(text(r.c, 'z.txt')).toBe('');
    const s = await run('echo hello > o.txt');
    expect(text(s.c, 'o.txt')).toBe('hello\n');
    expect(s.stdout).toBe('');
  });

  it('>> appends and creates a missing file', async () => {
    const r = await run('echo a >> z.txt; echo b >> n.txt');
    expect(text(r.c, 'z.txt')).toBe('zed\na\n');
    expect(text(r.c, 'n.txt')).toBe('b\n');
  });

  it('a failing command still leaves the truncated file', async () => {
    const r = await run('cat nope > z.txt');
    expect(r.exitCode).toBe(1);
    expect(text(r.c, 'z.txt')).toBe('');
  });

  it('a redirect before the words works and a bad target does not run the command', async () => {
    const r = await run('> o.txt echo hi');
    expect(text(r.c, 'o.txt')).toBe('hi\n');
    const s = await run('echo hi > ../x');
    expect(s.exitCode).toBe(1);
    expect(s.stderr).toContain('escapes');
  });
});

describe('unsupported (exit 127)', () => {
  const lines = [
    'cd a',
    'ls -la',
    'ls -R',
    'ls --color',
    'cat',
    'cat -',
    'echo -e hi',
    'echo -ne hi',
    'mkdir -m 755 x',
    'touch -t 1 x',
    'rm -v z.txt',
    'rm -R a',
    'rm -- z.txt',
    'mv -f a b',
    'mv a b c',
    'cp -a a b',
    'cp a b c',
    'find',
    'find -name x',
    'find a -type f',
    'find a -delete -print',
    'find a -print -delete',
    'find a -name',
    'find a -name x -name y',
    'find a b',
    'true x',
    'false x',
    'pwd x',
    'git status',
    'ls | cat',
    'echo $HOME',
    'ls *.txt',
  ];
  it.each(lines)('%s', async (line) => {
    const r = await run(line);
    expect(r.exitCode).toBe(127);
    expect(r.unsupportedReason).toBeTruthy();
    expect(r.stderr).toBe(`unsupported: ${r.unsupportedReason}`);
  });

  it('keeps the effects of earlier commands and stops at the first unsupported one', async () => {
    const r = await run('mkdir n; cd n; mkdir m');
    expect(r.exitCode).toBe(127);
    expect(r.c.fs.get('n')).toBeDefined();
    expect(r.c.fs.get('m')).toBeUndefined();
  });

  it('a parse-level unsupported segment ends the line even after a failed &&', async () => {
    const r = await run('false && ls | cat');
    expect(r.exitCode).toBe(127);
  });

  it('a handler that declines leaves no truncated redirect target behind', async () => {
    const r = await run('ls -la > z.txt');
    expect(r.exitCode).toBe(127);
    expect(text(r.c, 'z.txt')).toBe('zed\n');
  });
});

describe('budget and limits', () => {
  it('the 257th executed command is unsupported', async () => {
    const c = ctx();
    const line = Array.from({ length: 64 }, () => 'true').join('; ');
    for (let i = 0; i < 4; i++) expect((await runLine(line, c.env)).exitCode).toBe(0);
    const r = await runLine('true', c.env);
    expect(r.exitCode).toBe(127);
    expect(r.unsupportedReason).toBe('command budget exceeded');
  });

  it('skipped && commands do not use the budget', async () => {
    const c = ctx();
    c.env.budget.commands = 1;
    expect((await runLine('false && true && true', c.env)).exitCode).toBe(1);
    expect(c.env.budget.commands).toBe(0);
  });

  it('a limit error rolls the whole line back with exit 1', async () => {
    const entries: Record<string, Entry> = {};
    for (let i = 0; i < 1999; i++) entries[`f${i}`] = f('');
    const c = ctx(entries);
    const r = await runLine('touch extra1; mkdir extra2 extra3', c.env);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBe('limit exceeded: entries');
    expect(c.fs.get('extra1')).toBeUndefined();
  });

  it('truncates long output', async () => {
    const c = ctx({ big: f('x'.repeat(5000)) });
    const r = await runLine('cat big', c.env);
    expect(r.stdout.endsWith('[truncated]')).toBe(true);
    expect(r.stdout.length).toBe(4096 + '[truncated]'.length);
  });
});

describe('generated supported lines', () => {
  it('never throw and never return 127', async () => {
    await fc.assert(
      fc.asyncProperty(arbProjectAndLine, async ({ project, line }) => {
        const c = ctx({ ...project.entries });
        const r = await runLine(line, c.env);
        expect(r.unsupportedReason).toBeUndefined();
        expect([0, 1]).toContain(r.exitCode);
      }),
      { numRuns: NUM_RUNS, interruptAfterTimeLimit: PBT_TIMEOUT },
    );
  });
});
