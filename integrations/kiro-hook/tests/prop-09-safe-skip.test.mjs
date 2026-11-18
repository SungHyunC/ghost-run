// Feature: kiro-integration, Property 9: Safe-list skip leaves no ghost (task 8.5, KI-P9). No Docker needed [no-docker].
// **Validates: Requirements 4.1, 4.8, 4.9**
import fc from 'fast-check';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decide } from '../lib/gate/decide.mjs';
import { BUILTIN_GRAMMAR } from '../lib/gate/safe-list.mjs';
import { createGateStore } from '../lib/store/gate-store.mjs';
import { makeMemTree } from './fixtures/mem-tree.mjs';
import { makeTempStore, shellEvent } from './fixtures/index.mjs';
import { FC_PARAMS, FILE_TIMEOUT_MS } from './pbt-config.mjs';

const FIXED_NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const wardSet = {
  wards: [
    { id: 'protect-data', kind: 'path', deny: ['delete', 'overwrite'], paths: ['data/**'] },
    { id: 'egress-1', kind: 'egress', secrets: ['.env', '**/.env', '**/*.pem', '**/id_rsa'], allow_hosts: [] },
  ],
};
const loadOk = async () => ({ ok: /** @type {const} */ (true), wardSet, safeCommands: [], file: 'wards.yaml' });

// Generators: allowed path words are lower-case segments with an optional plain extension. They never start
// with a dash or tilde, never contain a dot-dot segment, and never match a secret pattern.
const segment = fc.stringMatching(/^[a-z][a-z0-9_]{0,7}$/);
const pathWord = fc
  .tuple(fc.array(segment, { minLength: 1, maxLength: 3 }), fc.constantFrom('', '.txt', '.md', '.json'))
  .map(([segs, ext]) => `${segs.join('/')}${ext}`);
const words = fc.array(pathWord, { minLength: 1, maxLength: 3 }).map((w) => w.join(' '));
const maybeWords = fc.array(pathWord, { maxLength: 3 }).map((w) => w.join(' '));
const textWords = fc.array(fc.stringMatching(/^[A-Za-z0-9]{1,8}$/), { maxLength: 4 }).map((w) => w.join(' '));
const int = fc.integer({ min: 0, max: 9999 });
const subsetOf = (/** @type {string[]} */ opts) => fc.subarray(opts, { maxLength: opts.length });

/** @param {string[]} parts */
const join = (parts) => parts.filter((p) => p !== '').join(' ');

/** One generator per built-in grammar entry, keyed by the entry name. */
/** @type {Record<string, fc.Arbitrary<string>>} */
const BY_ENTRY = {
  pwd: fc.constant('pwd'),
  ls: fc.tuple(subsetOf(['-a', '-l', '-la', '-al']), maybeWords).map(([o, w]) => join(['ls', ...o, w])),
  cat: words.map((w) => `cat ${w}`),
  head: fc.tuple(fc.option(int, { nil: undefined }), words).map(([n, w]) => join(['head', n === undefined ? '' : `-n ${n}`, w])),
  tail: fc.tuple(fc.option(int, { nil: undefined }), words).map(([n, w]) => join(['tail', n === undefined ? '' : `-n ${n}`, w])),
  wc: fc.tuple(subsetOf(['-l', '-w', '-c']), words).map(([o, w]) => join(['wc', ...o, w])),
  'git status': fc.constant('git status'),
  'git diff': fc.option(words, { nil: undefined }).map((w) => join(['git diff', w === undefined ? '' : `-- ${w}`])),
  'git log': fc.option(words, { nil: undefined }).map((w) => join(['git log', w === undefined ? '' : `-- ${w}`])),
  'git show': fc.constant('git show'),
  'git branch': fc.constant('git branch'),
  echo: textWords.map((w) => join(['echo', w])),
};

const entryNames = BUILTIN_GRAMMAR.map((e) => e.name.join(' '));
const safeCommand = fc.oneof(...entryNames.map((n) => BY_ENTRY[n]));

/** @type {{ cleanup: () => void }[]} */
const temps = [];
afterEach(() => {
  for (const t of temps.splice(0)) t.cleanup();
  vi.restoreAllMocks();
});

/**
 * Decide one command in a fresh temporary workspace and return everything observable.
 * @param {string} command
 */
async function runOne(command) {
  const tmp = makeTempStore();
  temps.push(tmp);
  const root = path.join(tmp.dir, 'ws');
  await fsp.mkdir(root, { recursive: true });
  const runPlan = vi.fn(async () => {
    throw new Error('runPlan must not be called');
  });
  const out = vi.spyOn(process.stdout, 'write');
  const err = vi.spyOn(process.stderr, 'write');
  const log = vi.spyOn(console, 'log');
  const d = await decide(
    { stdin: JSON.stringify(shellEvent(command, { cwd: root })), root, env: {}, elapsedSec: 0 },
    {
      loadWards: /** @type {any} */ (loadOk),
      clock: () => FIXED_NOW,
      uuid: () => 'run-fixed_1',
      store: createGateStore(root),
      fsView: makeMemTree({ [root]: { dir: true } }),
      runPlan,
    },
  );
  const printed = out.mock.calls.length + err.mock.calls.length + log.mock.calls.length;
  vi.restoreAllMocks();
  const storeDir = path.join(root, '.ghost-run');
  const read = async (/** @type {string} */ rel) => fsp.readFile(path.join(storeDir, rel), 'utf8').catch(() => '');
  const kinds = (await read('stats.jsonl')).split('\n').filter(Boolean).map((l) => JSON.parse(l).kind);
  const runs = await fsp.readdir(path.join(storeDir, 'runs')).catch(() => []);
  const grave = await read('graveyard.jsonl');
  const top = await fsp.readdir(storeDir).catch(() => []);
  tmp.cleanup();
  temps.splice(temps.indexOf(tmp), 1);
  return { d, runPlan, printed, kinds, runs, grave, top };
}

/** @type {Record<string, number>} */
const executed = {};

describe('Property 9: Safe-list skip leaves no ghost (KI-P9)', { timeout: FILE_TIMEOUT_MS }, () => {
  it('the generators cover every built-in grammar entry', () => {
    expect(Object.keys(BY_ENTRY).sort()).toEqual([...entryNames].sort());
  });

  it('a Safe_Command makes no runPlan call, writes no record, appends seen and safe-skip, prints nothing, exits 0', async () => {
    let runs = 0;
    await fc.assert(
      fc.asyncProperty(safeCommand, async (command) => {
        runs += 1;
        const r = await runOne(command);
        expect(r.runPlan, command).not.toHaveBeenCalled();
        expect(r.d, command).toEqual({ kind: 'allow', exit: 0, stdout: '', stderr: '', stats: ['seen', 'safe-skip'] });
        expect(r.kinds, command).toEqual(['seen', 'safe-skip']);
        expect(r.runs, command).toEqual([]);
        expect(r.grave, command).toBe('');
        expect(r.top.filter((n) => n !== 'stats.jsonl'), command).toEqual([]);
        expect(r.printed, command).toBe(0);
      }),
      FC_PARAMS,
    );
    executed['safeCommand'] = runs;
  });

  // Fixed examples: one per built-in entry, so a regression names the entry.
  it.each([
    'pwd', 'ls', 'ls -la src', 'cat README.md', 'head -n 5 README.md', 'tail -n 20 src/a.txt', 'wc -l README.md',
    'git status', 'git diff -- src/a.txt', 'git log -- src', 'git show', 'git branch', 'echo hello world',
  ])('example: %s leaves no ghost', async (command) => {
    const r = await runOne(command);
    expect(r.runPlan).not.toHaveBeenCalled();
    expect(r.kinds).toEqual(['seen', 'safe-skip']);
    expect(r.d).toMatchObject({ kind: 'allow', exit: 0, stdout: '', stderr: '' });
    expect(r.runs).toEqual([]);
    expect(r.grave).toBe('');
  });

  it('reports the number of runs executed per property', () => {
    console.log(`KI-P9 runs executed: ${JSON.stringify(executed)} (numRuns=${FC_PARAMS.numRuns})`);
    for (const n of Object.values(executed)) expect(n).toBeGreaterThanOrEqual(FC_PARAMS.numRuns);
  });
});
