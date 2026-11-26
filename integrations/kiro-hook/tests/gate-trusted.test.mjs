// Gate: a trusted shell line passes without a rehearsal; the same line with a forbidden tail is rehearsed.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decide } from '../lib/gate/decide.mjs';
import { loadWardsForHook } from '../lib/wards-file.mjs';
import { createGateStore } from '../lib/store/gate-store.mjs';
import { makeHookEvent, makeTempStore, shellEvent } from './fixtures/index.mjs';
import { makeMemTree } from './fixtures/mem-tree.mjs';

/** @type {ReturnType<typeof makeTempStore>} */
let tmp;
/** @type {string} */
let root;
beforeEach(async () => {
  tmp = makeTempStore();
  root = path.join(tmp.dir, 'ws');
  await fsp.mkdir(path.join(root, 'sub'), { recursive: true });
  await fsp.mkdir(path.join(tmp.dir, 'outside'), { recursive: true });
});
afterEach(() => {
  tmp.cleanup();
});

/** @type {import('@ghost-run/core').WardSet} */
const wardSet = {
  wards: [{ id: 'protect-data', kind: 'path', deny: ['delete', 'overwrite'], paths: ['data/**'] }],
};
const TRUSTED = ['corepack pnpm test', 'corepack pnpm --filter * test', 'npx vitest run **'];
const loadWards = async () => ({
  ok: /** @type {const} */ (true),
  wardSet,
  safeCommands: [],
  trustedCommands: TRUSTED,
  file: 'wards.yaml',
});

const ISO = { mode: /** @type {const} */ ('docker-box'), p1Claimed: true, p5Claimed: true, p6Claimed: true, readOnlyMounts: [] };
/** @param {'pass' | 'block'} verdict */
function fakeResult(verdict) {
  const block = verdict === 'block';
  return {
    schemaVersion: 1,
    runId: 'ignored',
    status: 'ok',
    rehearsed: true,
    verdict,
    wardVerdict: {
      verdict,
      violations: block ? [{ wardId: 'protect-data', wardKind: 'path', reason: 'would delete data/x' }] : [],
      notices: [],
    },
    report: {
      snapshots: [],
      changes: [block ? [{ kind: 'file-deleted', path: 'data/x' }] : []],
      effectsOutside: [[]],
      observedEvents: [],
      variantResults: [],
    },
    exitCodes: [0],
    copy: { cloned: true, location: 'copy' },
    isolation: ISO,
    recorder: { location: 'in-box', tamperResistant: false },
    captures: [],
    diagnostics: [],
    staticFindings: [],
    notices: [],
    phases: {},
  };
}

/** A runner that blocks any plan whose command contains "rm -rf", and passes the rest. */
function runner() {
  return vi.fn(async (/** @type {{ command: string }[]} */ plan) => ({
    result: fakeResult(plan[0]?.command.includes('rm -rf') ? 'block' : 'pass'),
    payloads: new Map(),
  }));
}

/** @param {Partial<any>} [over] */
function depsOf(over = {}) {
  return {
    loadWards,
    clock: () => Date.UTC(2026, 10, 26, 12, 0, 0),
    uuid: () => 'run-fixed_1',
    warnMode: /** @type {'exit2' | 'ask'} */ ('exit2'),
    store: createGateStore(root),
    fsView: makeMemTree({ [root]: { dir: true } }),
    ...over,
  };
}

/** @param {unknown} ev */
const inputOf = (ev) => ({ stdin: JSON.stringify(ev), root, env: {}, elapsedSec: 0 });

/** @param {string} rel */
async function readJsonl(rel) {
  try {
    const text = await fsp.readFile(path.join(root, '.ghost-run', rel), 'utf8');
    return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
const statKinds = async () => (await readJsonl('stats.jsonl')).map((e) => e.kind);

describe('gate: trusted commands', () => {
  it('passes a trusted line silently with `trusted` recorded, no rehearsal, no record, no grave', async () => {
    const runPlan = runner();
    const line = `cd ${root} && corepack pnpm --filter @ghost-run/site test 2>&1 | tail -20`;
    const d = await decide(inputOf(shellEvent(line)), depsOf({ runPlan }));
    expect(d).toEqual({ kind: 'allow', exit: 0, stdout: '', stderr: '', stats: ['seen', 'trusted'] });
    expect(runPlan).not.toHaveBeenCalled();
    expect(await statKinds()).toEqual(['seen', 'trusted']);
    expect(await readJsonl('graveyard.jsonl')).toEqual([]);
    await expect(fsp.readdir(path.join(root, '.ghost-run', 'runs'))).rejects.toThrow();
  });

  it('the same line with `; rm -rf data` appended is rehearsed and blocked, and a grave is written', async () => {
    const runPlan = runner();
    const line = `cd ${root} && corepack pnpm --filter @ghost-run/site test 2>&1 | tail -20; rm -rf data`;
    const d = await decide(inputOf(shellEvent(line)), depsOf({ runPlan }));
    expect(d).toMatchObject({ kind: 'deny', exit: 2 });
    expect(d.stderr).toContain('protect-data');
    expect(runPlan).toHaveBeenCalledTimes(1);
    expect(await statKinds()).toEqual(['seen', 'ghosted', 'blocked']);
    expect(await readJsonl('graveyard.jsonl')).toHaveLength(1);
  });

  it('a trusted line followed by a construct of every forbidden kind is rehearsed', async () => {
    for (const tail of ['|| rm -rf data', '&& rm -rf data', '$(rm -rf data)', '`rm -rf data`', '> out.txt', '| sh']) {
      const runPlan = runner();
      const d = await decide(inputOf(shellEvent(`corepack pnpm test ${tail}`)), depsOf({ runPlan }));
      expect(runPlan, tail).toHaveBeenCalledTimes(1);
      expect(d.stats, tail).not.toContain('trusted');
    }
  });

  it('a cd outside the workspace is rehearsed, a cd to a subfolder or the root is trusted', async () => {
    const outside = path.join(tmp.dir, 'outside');
    for (const dir of ['..', outside, '/tmp', `${root}-demo`]) {
      const runPlan = runner();
      const d = await decide(inputOf(shellEvent(`cd ${dir} && corepack pnpm test`)), depsOf({ runPlan }));
      expect(d.stats, dir).not.toContain('trusted');
      expect(runPlan, dir).toHaveBeenCalledTimes(1);
    }
    for (const dir of ['sub', '.', root, path.join(root, 'sub')]) {
      const runPlan = runner();
      const d = await decide(inputOf(shellEvent(`cd ${dir} && corepack pnpm test`)), depsOf({ runPlan }));
      expect(d.stats, dir).toContain('trusted');
      expect(runPlan, dir).not.toHaveBeenCalled();
    }
  });

  it('a tool cwd outside the workspace is not trusted', async () => {
    const runPlan = runner();
    const ev = makeHookEvent('execute_bash', { command: 'corepack pnpm test', cwd: path.join(tmp.dir, 'outside') });
    const d = await decide(inputOf(ev), depsOf({ runPlan }));
    expect(d.stats).not.toContain('trusted');
  });

  it('an unlisted command and a never-trusted command are rehearsed even with a catch-all pattern', async () => {
    const runPlan = runner();
    const catchAll = async () => ({ ...(await loadWards()), trustedCommands: ['**'] });
    const d1 = await decide(inputOf(shellEvent('corepack pnpm install')), depsOf({ runPlan, loadWards: async () => ({ ...(await loadWards()), trustedCommands: TRUSTED }) }));
    expect(d1.stats).not.toContain('trusted');
    for (const line of ['bash -c "corepack pnpm test"', 'sudo corepack pnpm test', 'curl https://a.example', 'node -e 1']) {
      const d = await decide(inputOf(shellEvent(line)), depsOf({ runPlan, loadWards: catchAll }));
      expect(d.stats, line).not.toContain('trusted');
    }
  });

  it('the approval command is denied even when listed', async () => {
    const runPlan = runner();
    const loader = async () => ({ ...(await loadWards()), trustedCommands: ['**'] });
    const d = await decide(inputOf(shellEvent('ghost-run approve g-1')), depsOf({ runPlan, loadWards: loader }));
    expect(d).toMatchObject({ kind: 'deny', exit: 2 });
    expect(runPlan).not.toHaveBeenCalled();
  });

  it('trust never applies to write tools', async () => {
    const runPlan = runner();
    const loader = async () => ({ ...(await loadWards()), trustedCommands: ['**'] });
    const ev = makeHookEvent('fs_write', { path: 'data/a.csv', text: 'x' });
    const d = await decide(inputOf(ev), depsOf({ runPlan, loadWards: loader }));
    expect(d.stats).not.toContain('trusted');
  });

  it('without trusted_commands nothing is trusted', async () => {
    const runPlan = runner();
    const bare = async () => ({ ok: /** @type {const} */ (true), wardSet, safeCommands: [], file: 'wards.yaml' });
    const d = await decide(inputOf(shellEvent('corepack pnpm test')), depsOf({ runPlan, loadWards: bare }));
    expect(d.stats).not.toContain('trusted');
    expect(runPlan).toHaveBeenCalledTimes(1);
  });
});

describe('gate: trusted_commands read from a wards file', () => {
  it('loadWardsForHook returns the trusted patterns of the file, and [] without the key', async () => {
    const file = path.join(root, 'wards.yaml');
    await fsp.writeFile(file, 'wards: []\ntrusted_commands: ["corepack pnpm test", "npx vitest run **"]\n');
    const a = await loadWardsForHook(root, {});
    expect(a.ok && a.trustedCommands).toEqual(['corepack pnpm test', 'npx vitest run **']);
    await fsp.writeFile(file, 'wards: []\n');
    const b = await loadWardsForHook(root, {});
    expect(b.ok && b.trustedCommands).toEqual([]);
  });

  it('an invalid pattern in the file fails the whole load (fail closed)', async () => {
    await fsp.writeFile(path.join(root, 'wards.yaml'), 'wards: []\ntrusted_commands: ["make; rm -rf data"]\n');
    const r = await loadWardsForHook(root, {});
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join('\n')).toContain('trusted_commands[0]');
  });
});
