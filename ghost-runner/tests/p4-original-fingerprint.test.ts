// Feature: ghost-runner, Property 4: Original fingerprint ignores excluded directories and finds every other change
// Validates: Requirements 4.10, 13.1, 13.3, 13.4
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFingerprints } from '@ghost-run/core';
import { fingerprintOriginal } from '../src/fs/fingerprint.js';
import {
  EXCLUDED_NAMES,
  materializeTree,
  mutationArb,
  treeArb,
  type Mutation,
  type TreeEntry,
} from './fixtures/index.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

const counts = { changes: 0, excludedOnly: 0 };
afterAll(() => {
  console.log(
    `Property 4 runs executed: changes=${counts.changes}, excludedOnly=${counts.excludedOnly} (mode=${PBT_MODE}, numRuns=${NUM_RUNS})`,
  );
});

const excludeDirs: string[] = [...EXCLUDED_NAMES];
const isExcluded = (p: string): boolean => p.split('/').some((s) => excludeDirs.includes(s));

function applyToDisk(root: string, m: Mutation): void {
  if (m.op === 'write') {
    mkdirSync(dirname(join(root, m.path)), { recursive: true });
    writeFileSync(join(root, m.path), m.content);
  } else if (m.op === 'delete') {
    rmSync(join(root, m.path), { force: true });
  } else if (existsSync(join(root, m.from))) {
    renameSync(join(root, m.from), join(root, m.to));
  }
}

function applyToModel(model: Map<string, string>, m: Mutation): void {
  if (m.op === 'write') model.set(m.path, m.content);
  else if (m.op === 'delete') model.delete(m.path);
  else {
    const c = model.get(m.from);
    if (c !== undefined) {
      model.delete(m.from);
      model.set(m.to, c);
    }
  }
}

const sortU16 = (a: string[]): string[] => a.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

const scenario = treeArb.chain((tree) =>
  fc.record({
    tree: fc.constant(tree),
    muts: fc.array(mutationArb(tree), { minLength: 1, maxLength: 4 }),
  }),
);

describe('Property 4: Original fingerprint ignores excluded directories and finds every other change', () => {
  it(
    'changedPaths equals the changed non-excluded files, and shortcut equals full',
    async () => {
      await fc.assert(
        fc.asyncProperty(scenario, async ({ tree, muts }: { tree: TreeEntry[]; muts: Mutation[] }) => {
          counts.changes++;
          const { root, cleanup } = materializeTree(tree);
          try {
            const model = new Map<string, string>();
            for (const e of tree) if (e.kind === 'file') model.set(e.path, e.content);
            const before = new Map(model);

            const base = await fingerprintOriginal(root, { excludeDirs, fingerprintMode: 'full' });
            for (const m of muts) {
              applyToDisk(root, m);
              applyToModel(model, m);
            }
            const full = await fingerprintOriginal(root, { excludeDirs, fingerprintMode: 'full' });
            const short = await fingerprintOriginal(root, { excludeDirs, baseline: base });

            const expected: string[] = [];
            for (const p of new Set([...before.keys(), ...model.keys()])) {
              if (isExcluded(p)) continue;
              if (before.get(p) !== model.get(p)) expected.push(p);
            }
            sortU16(expected);

            const cmp = compareFingerprints(base.fingerprint, full.fingerprint);
            expect(cmp.changedPaths).toEqual(expected);
            expect(cmp.changed).toBe(expected.length > 0);
            expect(short.fingerprint).toEqual(full.fingerprint);
            // No excluded path may ever appear in a manifest.
            expect(Object.keys(full.fingerprint.manifest).filter(isExcluded)).toEqual([]);
          } finally {
            cleanup();
          }
        }),
        pbtParams(false),
      );
    },
    testTimeoutMs(false),
  );

  it(
    'mutating only entries inside excluded directories reports no change',
    async () => {
      const seg = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);
      await fc.assert(
        fc.asyncProperty(
          treeArb,
          fc.array(fc.tuple(fc.constantFrom(...excludeDirs), seg, fc.string({ maxLength: 20 })), {
            minLength: 1,
            maxLength: 4,
          }),
          async (tree, writes) => {
            counts.excludedOnly++;
            const { root, cleanup } = materializeTree(tree);
            try {
              const base = await fingerprintOriginal(root, { excludeDirs, fingerprintMode: 'full' });
              for (const [d, s, c] of writes) {
                mkdirSync(join(root, d, s), { recursive: true });
                writeFileSync(join(root, d, s, 'f.txt'), c);
              }
              const full = await fingerprintOriginal(root, { excludeDirs, fingerprintMode: 'full' });
              const short = await fingerprintOriginal(root, { excludeDirs, baseline: base });
              for (const after of [full, short]) {
                const cmp = compareFingerprints(base.fingerprint, after.fingerprint);
                expect(cmp.changed).toBe(false);
                expect(cmp.changedPaths).toEqual([]);
              }
            } finally {
              cleanup();
            }
          },
        ),
        pbtParams(false),
      );
    },
    testTimeoutMs(false),
  );
});
