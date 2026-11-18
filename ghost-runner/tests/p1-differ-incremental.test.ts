// Feature: ghost-runner, Property 1: Incremental differ equals full-hash differ
// Validates: Requirements 11.1, 11.2, 11.4, 11.10
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { advanceEntries, diff, diffDiagnostics, type DiffState } from '../src/fs/differ.js';
import type { ManifestEntry } from '../src/fs/manifest.js';
import { EXCLUDED_NAMES, materializeTree, treeArb, type TreeEntry } from './fixtures/index.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

const counts = { sequences: 0, noContentChange: 0 };
afterAll(() => {
  console.log(
    `Property 1 runs executed: sequences=${counts.sequences}, noContentChange=${counts.noContentChange} (mode=${PBT_MODE}, numRuns=${NUM_RUNS})`,
  );
});

const excludeDirs: string[] = [...EXCLUDED_NAMES];
const isExcluded = (p: string): boolean => p.split('/').some((s) => excludeDirs.includes(s));
const noSql = {} as const;
const state = (entries: readonly ManifestEntry[]): DiffState => ({ entries, sqlite: noSql });

type Op =
  | 'overwrite-same-size'
  | 'overwrite-other-size'
  | 'touch'
  | 'chmod'
  | 'retarget'
  | 'create'
  | 'delete'
  | 'rmdir'
  | 'rename'
  | 'file-to-dir'
  | 'file-to-symlink';

const OPS: Op[] = [
  'overwrite-same-size',
  'overwrite-other-size',
  'touch',
  'chmod',
  'retarget',
  'create',
  'delete',
  'rmdir',
  'rename',
  'file-to-dir',
  'file-to-symlink',
];

interface Step {
  readonly op: Op;
  readonly pick: number;
  readonly text: string;
}

const stepArb: fc.Arbitrary<Step> = fc.record({
  op: fc.constantFrom(...OPS),
  pick: fc.nat(1000),
  text: fc.stringMatching(/^[a-z]{1,6}$/),
});

/** lstat-based listing of the tree; never follows links. */
function list(root: string): { files: string[]; links: string[]; dirs: string[] } {
  const out = { files: [] as string[], links: [] as string[], dirs: [] as string[] };
  const visit = (rel: string): void => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      const r = rel === '' ? name : `${rel}/${name}`;
      const st = lstatSync(join(root, r));
      if (st.isSymbolicLink()) out.links.push(r);
      else if (st.isDirectory()) {
        out.dirs.push(r);
        visit(r);
      } else if (st.isFile()) out.files.push(r);
    }
  };
  visit('');
  return out;
}

const choose = (a: string[], pick: number): string | undefined =>
  a.length === 0 ? undefined : a[pick % a.length];

/** Applies one mutation to disk. A mutation without a suitable target is a no-op. */
function apply(root: string, s: Step, tick: number): void {
  const l = list(root);
  const abs = (p: string): string => join(root, p);
  const file = choose(l.files, s.pick);
  switch (s.op) {
    case 'overwrite-same-size':
      if (file !== undefined) {
        const len = lstatSync(abs(file)).size;
        writeFileSync(abs(file), (s.text + 'q'.repeat(len)).slice(0, len).padEnd(len, 'z'));
      }
      break;
    case 'overwrite-other-size':
      if (file !== undefined) writeFileSync(abs(file), `${s.text}#${tick}`);
      break;
    case 'touch':
      if (file !== undefined) utimesSync(abs(file), new Date(1_000_000 + tick * 1000), new Date(2_000_000 + tick * 1000));
      break;
    case 'chmod':
      if (file !== undefined) chmodSync(abs(file), (lstatSync(abs(file)).mode & 0o777) === 0o600 ? 0o644 : 0o600);
      break;
    case 'retarget': {
      const link = choose(l.links, s.pick);
      if (link !== undefined) {
        rmSync(abs(link));
        symlinkSync(`retarget-${s.text}`, abs(link));
      }
      break;
    }
    case 'create': {
      const dir = choose(['', ...l.dirs], s.pick) ?? '';
      const p = join(dir, `${s.text}.created`);
      mkdirSync(dirname(abs(p)), { recursive: true });
      writeFileSync(abs(p), s.text);
      break;
    }
    case 'delete':
      if (file !== undefined) rmSync(abs(file));
      break;
    case 'rmdir': {
      const d = choose(l.dirs, s.pick);
      if (d !== undefined) rmSync(abs(d), { recursive: true, force: true });
      break;
    }
    case 'rename':
      if (file !== undefined) renameSync(abs(file), abs(`${s.text}.moved`));
      break;
    case 'file-to-dir':
      if (file !== undefined) {
        rmSync(abs(file));
        mkdirSync(abs(file));
        writeFileSync(join(abs(file), 'inner.txt'), s.text);
      }
      break;
    case 'file-to-symlink':
      if (file !== undefined) {
        rmSync(abs(file));
        symlinkSync(`to-${s.text}`, abs(file));
      }
      break;
  }
}

const scenario = fc.record({
  tree: treeArb,
  steps: fc.array(fc.array(stepArb, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 3 }),
});

/** Entries as seen by a differ that hashes every file (no previous state). */
async function fullEntries(root: string, stepIndex: number): Promise<ManifestEntry[]> {
  return (await advanceEntries({ root, excludeDirs, previous: [], baselineNs: '0', stepIndex })).entries;
}

describe('Property 1: Incremental differ equals full-hash differ', () => {
  it(
    'Change[] and Diagnostics from ctime-candidate hashing equal those from hashing every file',
    async () => {
      await fc.assert(
        fc.asyncProperty(scenario, async ({ tree, steps }: { tree: TreeEntry[]; steps: Step[][] }) => {
          counts.sequences++;
          const { root, cleanup } = materializeTree(tree);
          try {
            let inc = await advanceEntries({ root, excludeDirs, previous: [], baselineNs: '0', stepIndex: 0 });
            let incEntries = inc.entries;
            let baselineNs = inc.nextBaselineNs;
            let fullBefore = await fullEntries(root, 0);
            expect(incEntries).toEqual(fullBefore);

            let tick = 0;
            for (const [i, batch] of steps.entries()) {
              for (const s of batch) apply(root, s, tick++);
              const next = await advanceEntries({
                root,
                excludeDirs,
                previous: incEntries,
                baselineNs,
                stepIndex: i + 1,
              });
              const fullAfter = await fullEntries(root, i + 1);

              // Same observed state, hence the same Changes and Diagnostics.
              expect(next.entries).toEqual(fullAfter);
              expect(diff(state(incEntries), state(next.entries))).toEqual(
                diff(state(fullBefore), state(fullAfter)),
              );
              expect(diffDiagnostics(state(incEntries), state(next.entries), i + 1)).toEqual(
                diffDiagnostics(state(fullBefore), state(fullAfter), i + 1),
              );
              expect(next.entries.filter((e) => isExcluded(e.path))).toEqual([]);

              incEntries = next.entries;
              fullBefore = fullAfter;
              baselineNs = next.nextBaselineNs;
              inc = next;
            }
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
    'touch yields no Change; chmod yields no Change but a mode-changed Diagnostic',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          treeArb,
          fc.constantFrom<'touch' | 'chmod'>('touch', 'chmod'),
          fc.nat(1000),
          async (tree, op, pick) => {
            const { root, cleanup } = materializeTree(tree);
            try {
              const files = list(root).files.filter((f) => !isExcluded(f));
              fc.pre(files.length > 0);
              const base = await advanceEntries({ root, excludeDirs, previous: [], baselineNs: '0', stepIndex: 0 });
              const target = files[pick % files.length] as string;
              counts.noContentChange++;
              if (op === 'touch') utimesSync(join(root, target), new Date(1_000_000), new Date(2_000_000));
              else chmodSync(join(root, target), (lstatSync(join(root, target)).mode & 0o777) === 0o600 ? 0o644 : 0o600);
              const next = await advanceEntries({
                root,
                excludeDirs,
                previous: base.entries,
                baselineNs: base.nextBaselineNs,
                stepIndex: 1,
              });
              expect(diff(state(base.entries), state(next.entries))).toEqual([]);
              const diags = diffDiagnostics(state(base.entries), state(next.entries), 1);
              expect(diags.map((d) => d.name)).toEqual(op === 'chmod' ? ['mode-changed'] : []);
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
