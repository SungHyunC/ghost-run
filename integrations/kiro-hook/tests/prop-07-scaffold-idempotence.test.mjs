// Property test for the world scaffold (task 12.2). No Docker needed [no-docker].
// Every scaffolded file lives in a temporary folder outside the repository and is removed afterwards.
import fc from 'fast-check';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWards } from '@ghost-run/wards-config';
import { describe, expect, it } from 'vitest';
import { scaffoldWorld } from '../lib/scaffold/scaffold.mjs';
import { SCAFFOLD_FILES, WORLD_NAME_PATTERN } from '../lib/scaffold/templates.mjs';
import { FC_PARAMS } from './pbt-config.mjs';

const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-'.split('');

const validName = fc
  .tuple(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.array(fc.constantFrom(...NAME_CHARS), { maxLength: 63 }),
  )
  .map(([h, t]) => h + t.join(''));

const invalidName = fc.oneof(
  fc.constantFrom('..', '.', 'a b', 'Upper', 'MiXed', '-lead', '1digit', 'under_score', 'a\\b', 'caf\u00e9'),
  fc.integer({ min: 65, max: 90 }).map((n) => `a${'b'.repeat(n - 1)}`),
);

/** First segment: valid or invalid. A name with a separator is covered by the `rest` generator. */
const nameArb = fc.oneof({ weight: 3, arbitrary: validName }, { weight: 2, arbitrary: invalidName });

const restArb = fc.constantFrom(
  'src/index.ts',
  'notes.md',
  'world.config.ts',
  'tests/contract.test.ts',
  '../escape.txt',
  'a/../../escape.txt',
  'tests/../../x.txt',
  'a\\b.txt',
);

const contentArb = fc.string({ maxLength: 60 });
const existingArb = fc.dictionary(fc.constantFrom(...SCAFFOLD_FILES, 'extra.txt', 'tests/extra.test.ts'), contentArb);

/** @returns {string} */
function tmp() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'ghost-run-scaffold-')));
}

/**
 * Map of every regular file (relative path to bytes as latin1) and symlink under dir.
 * @param {string} dir
 * @param {string} [rel]
 * @returns {Record<string, string>}
 */
function tree(dir, rel = '') {
  /** @type {Record<string, string>} */
  const out = {};
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isSymbolicLink()) out[r] = 'symlink';
    else if (e.isDirectory()) Object.assign(out, tree(dir, r));
    else out[r] = readFileSync(join(dir, r)).toString('latin1');
  }
  return out;
}

/** @param {string} root @param {string} name @param {Record<string, string>} files */
function seed(root, name, files) {
  for (const [f, text] of Object.entries(files)) {
    const abs = join(root, 'worlds', name, ...f.split('/'));
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, text);
  }
}

describe('world scaffold', () => {
  it('Property 7: running twice equals once, existing files never change, invalid input creates nothing', async () => {
    // Feature: kiro-integration, Property 7: Scaffold idempotence
    // **Validates: Requirements 16.1, 16.4, 16.5, 16.6, 16.7**
    await fc.assert(
      fc.asyncProperty(nameArb, restArb, existingArb, async (name, rest, existing) => {
        const root = tmp();
        try {
          const rel = `worlds/${name}/${rest}`;
          const validPath =
            WORLD_NAME_PATTERN.test(name) && !rest.split('/').includes('..') && !rest.includes('\\');
          if (WORLD_NAME_PATTERN.test(name)) seed(root, name, existing);
          const before = tree(root);

          const first = await scaffoldWorld(root, rel);
          const afterOnce = tree(root);
          const second = await scaffoldWorld(root, rel);
          const afterTwice = tree(root);

          expect(afterTwice).toEqual(afterOnce);
          if (!validPath) {
            expect(afterOnce).toEqual(before);
            expect(first.created).toEqual([]);
            expect(first.status === 'created' || first.status === 'noop').toBe(false);
            return;
          }
          expect(second.created).toEqual([]);
          // No existing file changed.
          for (const [f, text] of Object.entries(before)) expect(afterOnce[f]).toBe(text);
          // Every scaffold file is present afterwards, and only below worlds/<name>/.
          for (const f of SCAFFOLD_FILES) expect(afterOnce[`worlds/${name}/${f}`]).toBeDefined();
          for (const f of Object.keys(afterOnce)) {
            if (!(f in before)) expect(f.startsWith(`worlds/${name}/`)).toBe(true);
          }
          // Generated content, when this run generated it.
          const wardsText = afterOnce[`worlds/${name}/wards.yaml`];
          if (!('wards.yaml' in existing)) {
            const parsed = parseWards(wardsText);
            expect(parsed.ok).toBe(true);
          }
          if (!('world.config.ts' in existing)) {
            expect(afterOnce[`worlds/${name}/world.config.ts`]).toContain('deterministic: false');
          }
          if (!('tests/contract.test.ts' in existing)) {
            expect(afterOnce[`worlds/${name}/tests/contract.test.ts`]).toContain('deterministic: false');
          }
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }),
      FC_PARAMS,
    );
  });

  it('Property 7: a symbolic-link component creates no file', async () => {
    // Feature: kiro-integration, Property 7: Scaffold idempotence
    // **Validates: Requirements 16.6**
    await fc.assert(
      fc.asyncProperty(validName, fc.constantFrom('world', 'tests', 'worlds'), async (name, which) => {
        const root = tmp();
        const outside = tmp();
        try {
          if (which === 'worlds') {
            symlinkSync(outside, join(root, 'worlds'));
          } else {
            mkdirSync(join(root, 'worlds'));
            if (which === 'world') {
              symlinkSync(outside, join(root, 'worlds', name));
            } else {
              mkdirSync(join(root, 'worlds', name));
              symlinkSync(outside, join(root, 'worlds', name, 'tests'));
            }
          }
          const r = await scaffoldWorld(root, `worlds/${name}/src/a.ts`);
          expect(r.status).toBe('rejected');
          expect(readdirSync(outside)).toEqual([]);
          // Nothing besides the link itself was created below the root.
          const t = tree(root);
          expect(Object.values(t).every((v) => v === 'symlink')).toBe(true);
          if (which !== 'worlds') expect(lstatSync(join(root, 'worlds')).isDirectory()).toBe(true);
        } finally {
          rmSync(root, { recursive: true, force: true });
          rmSync(outside, { recursive: true, force: true });
        }
      }),
      FC_PARAMS,
    );
  });
});
