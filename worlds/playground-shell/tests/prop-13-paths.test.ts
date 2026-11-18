import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toVirtualPath } from '../src/vfs/path.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { arbPathArg, arbVirtualPath } from './support/arb-project.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

/** Independent reference: resolve segments; null when the walk climbs above the root. */
function reference(arg: string, cwd: string): string | null {
  const parts = (arg.startsWith('/') ? arg : `${cwd}/${arg}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(p);
  }
  return out.join('/');
}

describe('Property 13: Paths cannot leave the project', () => {
  it(
    'returns a canonical path or fails; climbing above the root or a leading ~ fails; absolute equals root-relative',
    () => {
      // Feature: ghost-shell, Property 13: Paths cannot leave the project
      // **Validates: Requirements 4.3**
      fc.assert(
        fc.property(arbPathArg, arbVirtualPath, (arg, cwd) => {
          const result = toVirtualPath(arg, cwd);
          if (arg.startsWith('~')) {
            expect(result.ok).toBe(false);
            return;
          }
          const expected = reference(arg, cwd);
          if (expected === null) {
            expect(result.ok).toBe(false);
          } else {
            expect(result.ok).toBe(true);
            if (result.ok) {
              expect(result.path).toBe(expected);
              if (result.path !== '') {
                for (const seg of result.path.split('/')) {
                  expect(seg).not.toBe('');
                  expect(seg).not.toBe('.');
                  expect(seg).not.toBe('..');
                }
              }
            }
          }
          if (arg.startsWith('/')) {
            expect(toVirtualPath('./' + arg.slice(1), '')).toEqual(result);
            expect(toVirtualPath(arg, 'other/dir')).toEqual(result);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('regression example: climbing above the root and ~ fail; absolute equals relative', () => {
    expect(toVirtualPath('..', '').ok).toBe(false);
    expect(toVirtualPath('a/../../b', '').ok).toBe(false);
    expect(toVirtualPath('~', 'a').ok).toBe(false);
    expect(toVirtualPath('~/x', 'a').ok).toBe(false);
    expect(toVirtualPath('../b', 'a')).toEqual({ ok: true, path: 'b' });
    expect(toVirtualPath('/a//./b', 'z')).toEqual(toVirtualPath('a/b', ''));
  });
});
