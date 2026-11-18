import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkDockerAvailable, dockerAvailable, describeDocker } from './docker-available.js';
import { CANARY, USERS_ROWS, countUsers, createFixtureRepo, materializeTree, mutationArb, treeArb } from './fixtures/index.js';
import { NUM_RUNS, PBT_MODE, pbtParams } from './pbt-config.js';

describe('pbt-config', () => {
  it('maps modes to run counts and time limits', () => {
    expect({ save: 20, explicit: 100, nightly: 10_000 }[PBT_MODE]).toBe(NUM_RUNS);
    if (PBT_MODE === 'save') expect(pbtParams(true).interruptAfterTimeLimit).toBe(25_000);
    else expect(pbtParams(true).interruptAfterTimeLimit).toBeUndefined();
  });
});

describe('docker-available', () => {
  it('returns a boolean within the 2 s limit', () => {
    const t = Date.now();
    expect(typeof checkDockerAvailable('ghost-run-box:nonexistent', 2_000)).toBe('boolean');
    expect(Date.now() - t).toBeLessThan(2_500);
    expect(typeof dockerAvailable).toBe('boolean');
  });
});

describeDocker('docker suite wrapper', () => {
  it('runs only when docker is available', () => {
    expect(dockerAvailable).toBe(true);
  });
});

describe('fixture repository', () => {
  it('has the specified layout', async () => {
    const repo = await createFixtureRepo();
    try {
      expect(repo.files.length).toBeLessThanOrEqual(50);
      expect(readFileSync(join(repo.root, '.env'), 'utf8')).toContain(CANARY);
      const pkg = JSON.parse(readFileSync(join(repo.root, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      };
      expect(pkg.scripts).toEqual({ test: 'node --test', clean: 'rm -rf data' });
      const names = readdirSync(repo.root);
      expect(names).toEqual(expect.arrayContaining(['data', 'build', 'app.db']));
      expect(names).not.toContain('node_modules');
      if (repo.sqlite !== 'placeholder') expect(countUsers(join(repo.root, 'app.db'))).toBe(USERS_ROWS);
    } finally {
      repo.cleanup();
    }
  });
});

describe('tree and mutation arbitraries', () => {
  it('generate bounded, materializable trees and valid mutations', () => {
    fc.assert(
      fc.property(
        treeArb.chain((t) => mutationArb(t).map((m) => [t, m] as const)),
        ([tree, m]) => {
          expect(tree.filter((e) => e.kind === 'file').length).toBeLessThanOrEqual(50);
          expect(['write', 'delete', 'rename']).toContain(m.op);
          const { root, cleanup } = materializeTree(tree);
          try {
            expect(readdirSync(root).length).toBeGreaterThan(0);
          } finally {
            cleanup();
          }
        },
      ),
      { numRuns: Math.min(NUM_RUNS, 100) },
    );
  });

  it('covers excluded names and every symlink flavor', () => {
    const entries = fc.sample(treeArb, 300).flat();
    expect(entries.some((e) => /(^|\/)(node_modules|\.git)\//.test(e.path))).toBe(true);
    for (const flavor of ['inside', 'outside', 'dangling', 'cyclic']) {
      expect(entries.some((e) => e.kind === 'symlink' && e.flavor === flavor)).toBe(true);
    }
  });
});
