import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import fc from 'fast-check';

/** Directory names that copy planning excludes at any depth. */
export const EXCLUDED_NAMES = ['node_modules', '.git'] as const;

const MAX_FILES = 50;

export type SymlinkFlavor = 'inside' | 'outside' | 'dangling' | 'cyclic';

export type TreeEntry =
  | { kind: 'dir'; path: string }
  | { kind: 'file'; path: string; content: string }
  | { kind: 'symlink'; path: string; target: string; flavor: SymlinkFlavor };

const segment = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);
const dirName = fc.oneof(
  { weight: 3, arbitrary: segment },
  { weight: 1, arbitrary: fc.constantFrom(...EXCLUDED_NAMES) },
);

/** A relative directory path of 0-4 segments; excluded names land at random depths. */
const dirPath = fc.array(dirName, { minLength: 0, maxLength: 4 }).map((s) => s.join('/'));

const fileEntry: fc.Arbitrary<TreeEntry> = fc
  .tuple(dirPath, segment, fc.string({ maxLength: 20 }))
  .map(([d, name, content]) => ({
    kind: 'file' as const,
    path: d === '' ? `${name}.txt` : `${d}/${name}.txt`,
    content,
  }));

const flavorArb: fc.Arbitrary<SymlinkFlavor> = fc.constantFrom('inside', 'outside', 'dangling', 'cyclic');

/**
 * Tree arbitrary: at most 50 regular files plus up to 5 symlinks. `outside`
 * points to an absolute path under a reserved `.invalid` name, `dangling` to a
 * missing name, `cyclic` to its own parent directory (or itself at top level).
 */
export const treeArb: fc.Arbitrary<TreeEntry[]> = fc
  .tuple(
    fc.array(fileEntry, { minLength: 1, maxLength: MAX_FILES - 5 }),
    fc.array(fc.tuple(dirPath, segment, flavorArb), { maxLength: 5 }),
  )
  .map(([files, links]) => {
    const seen = new Set<string>();
    const out: TreeEntry[] = [];
    for (const f of files) {
      if (!seen.has(f.path)) {
        seen.add(f.path);
        out.push(f);
      }
    }
    const firstFile = out.find((e) => e.kind === 'file')?.path ?? 'x.txt';
    for (const [d, name, flavor] of links) {
      const path = d === '' ? `${name}.lnk` : `${d}/${name}.lnk`;
      if (seen.has(path)) continue;
      seen.add(path);
      const target =
        flavor === 'inside'
          ? firstFile
          : flavor === 'outside'
            ? '/ghost-outside.invalid/target'
            : flavor === 'dangling'
              ? 'does-not-exist'
              : d === ''
                ? path
                : d;
      out.push({ kind: 'symlink', path, target, flavor });
    }
    return out;
  });

export type Mutation =
  | { op: 'write'; path: string; content: string }
  | { op: 'delete'; path: string }
  | { op: 'rename'; from: string; to: string };

/** Mutation arbitrary over the file paths of a given tree (plus fresh paths for writes). */
export function mutationArb(tree: readonly TreeEntry[]): fc.Arbitrary<Mutation> {
  const files = tree.filter((e) => e.kind === 'file').map((e) => e.path);
  const existing = fc.constantFrom(...(files.length > 0 ? files : ['x.txt']));
  const content = fc.string({ maxLength: 20 });
  return fc.oneof(
    fc.record({ op: fc.constant('write' as const), path: existing, content }),
    fc.record({ op: fc.constant('write' as const), path: segment.map((s) => `${s}.new`), content }),
    fc.record({ op: fc.constant('delete' as const), path: existing }),
    fc.record({ op: fc.constant('rename' as const), from: existing, to: segment.map((s) => `${s}.renamed`) }),
  );
}

/** Materialize entries under a fresh temp dir; returns the root and a cleanup. */
export function materializeTree(entries: readonly TreeEntry[]): { root: string; cleanup(): void } {
  const base = mkdtempSync(join(tmpdir(), 'ghost-tree-'));
  const root = join(base, 'root');
  mkdirSync(root);
  for (const e of entries) {
    const abs = join(root, e.path);
    mkdirSync(dirname(abs), { recursive: true });
    if (e.kind === 'file') writeFileSync(abs, e.content);
    else if (e.kind === 'dir') mkdirSync(abs, { recursive: true });
    else {
      const target = e.flavor === 'outside' || e.flavor === 'dangling' ? e.target : join(root, e.target);
      try {
        symlinkSync(target, abs);
      } catch {
        /* path collides with an existing entry; ignore */
      }
    }
  }
  return { root, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}
