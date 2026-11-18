// Feature: ghost-runner, Property 3: Copy fidelity and link safety
// Validates: Requirements 4.3, 4.4, 4.7, 13.8
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFingerprints } from '@ghost-run/core';
import { copyOriginal, type CopyStrategy } from '../src/copy/copier.js';
import { fingerprintOriginal } from '../src/fs/fingerprint.js';
import { EXCLUDED_NAMES, materializeTree, treeArb, type TreeEntry } from './fixtures/index.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

type Node = { type: 'file'; hash: string } | { type: 'dir' } | { type: 'symlink'; target: string };

/** lstat walk, never follows links. Skips real directories whose name is in `skip`, at any depth. */
function walk(root: string, skip: readonly string[]): Map<string, Node> {
  const out = new Map<string, Node>();
  const rec = (abs: string, rel: string): void => {
    for (const name of readdirSync(abs)) {
      const p = join(abs, name);
      const r = rel === '' ? name : `${rel}/${name}`;
      const st = lstatSync(p);
      if (st.isSymbolicLink()) out.set(r, { type: 'symlink', target: readlinkSync(p) });
      else if (st.isDirectory()) {
        if (skip.includes(name)) continue;
        out.set(r, { type: 'dir' });
        rec(p, r);
      } else if (st.isFile()) {
        out.set(r, { type: 'file', hash: createHash('sha256').update(readFileSync(p)).digest('hex') });
      }
    }
  };
  rec(root, '');
  return out;
}

/** Plain recursive clone helper: honors exclusions at every depth, copies links as links. */
const folderStrategy: CopyStrategy = async ({ original, dest, excludeDirs }) => {
  const rec = (src: string, dst: string): void => {
    for (const name of readdirSync(src)) {
      const s = join(src, name);
      const d = join(dst, name);
      const st = lstatSync(s);
      if (st.isSymbolicLink()) symlinkSync(readlinkSync(s), d);
      else if (st.isDirectory()) {
        if (excludeDirs.includes(name)) continue;
        mkdirSync(d);
        rec(s, d);
      } else if (st.isFile()) copyFileSync(s, d);
    }
  };
  rec(original, dest);
};

const counts: Record<string, number> = {};
afterAll(() => {
  console.log(
    `Property 3 runs executed: ${JSON.stringify(counts)} (mode=${PBT_MODE}, numRuns=${NUM_RUNS})`,
  );
});

const exclusionArb = fc.oneof(
  fc.constant<string[]>([...EXCLUDED_NAMES]),
  fc.subarray<string>([...EXCLUDED_NAMES, 'build', 'a', 'b'], { minLength: 1 }),
);

const scenario = fc.tuple(treeArb, exclusionArb);

describe.each([
  ['default planner (cp -RP)', undefined],
  ['injected folder-level copyStrategy', folderStrategy],
] as const)('Property 3: Copy fidelity and link safety, %s', (label, strategy) => {
  it(
    'Copy omits excluded dirs, keeps every other entry equal, keeps links as links, never follows outside links',
    async () => {
      counts[label] = 0;
      await fc.assert(
        fc.asyncProperty(scenario, async ([tree, excludeDirs]: [TreeEntry[], string[]]) => {
          counts[label]!++;
          const { root, cleanup } = materializeTree(tree);
          const outside = mkdtempSync(join(tmpdir(), 'ghost-outside-'));
          let copyDir: string | undefined;
          let sentinel: string | undefined;
          try {
            // Real outside targets: a file and a directory that must never be copied through a link.
            writeFileSync(join(outside, 'secret.txt'), 'OUTSIDE-CANARY');
            mkdirSync(join(outside, 'dir'));
            writeFileSync(join(outside, 'dir', 'inner.txt'), 'OUTSIDE-INNER');
            const taken = new Set(readdirSync(root));
            if (!taken.has('outfile')) symlinkSync(join(outside, 'secret.txt'), join(root, 'outfile'));
            if (!taken.has('outdir')) symlinkSync(join(outside, 'dir'), join(root, 'outdir'));
            const linkName = excludeDirs[0]!;
            if (!taken.has(linkName)) symlinkSync(join(outside, 'dir'), join(root, linkName));

            const before = await fingerprintOriginal(root, { excludeDirs, fingerprintMode: 'full' });
            const out = await copyOriginal(
              strategy === undefined ? { original: root, excludeDirs } : { original: root, excludeDirs, copyStrategy: strategy },
            );
            expect(out.status).toBe('ok');
            if (out.status !== 'ok') return;
            copyDir = out.copyDir;
            sentinel = out.sentinelPath;

            const expected = walk(root, excludeDirs);
            const actual = walk(copyDir, []);

            // No directory with an excluded name anywhere in the Copy.
            const excludedDirs = [...actual.entries()].filter(
              ([p, n]) => n.type === 'dir' && excludeDirs.includes(p.split('/').pop()!),
            );
            expect(excludedDirs).toEqual([]);

            // Same entries with equal type, hash and link target string.
            expect(Object.fromEntries(actual)).toEqual(Object.fromEntries(expected));

            // Links stay links; nothing from the outside tree was materialized.
            for (const [p, n] of expected) {
              if (n.type === 'symlink') expect(actual.get(p)).toEqual(n);
            }
            for (const [p, n] of actual) {
              if (n.type === 'file') expect(readFileSync(join(copyDir, p), 'utf8')).not.toContain('OUTSIDE-');
            }

            // Original unchanged by copying.
            const after = await fingerprintOriginal(root, { excludeDirs, fingerprintMode: 'full' });
            const cmp = compareFingerprints(before.fingerprint, after.fingerprint);
            expect(cmp.changed).toBe(false);
            expect(cmp.changedPaths).toEqual([]);
          } finally {
            if (copyDir !== undefined) rmSync(copyDir, { recursive: true, force: true });
            if (sentinel !== undefined) rmSync(sentinel, { force: true });
            rmSync(outside, { recursive: true, force: true });
            cleanup();
          }
        }),
        pbtParams(false),
      );
    },
    testTimeoutMs(false),
  );
});
