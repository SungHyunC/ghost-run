import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { toVirtualPath } from '../src/vfs/path.js';
import { arbPathArg, arbVirtualPath } from './support/arb-project.js';
import { NUM_RUNS } from './pbt-config.js';

describe('toVirtualPath', () => {
  it('joins a relative argument to cwd', () => {
    expect(toVirtualPath('b/c', 'a')).toEqual({ ok: true, path: 'a/b/c' });
    expect(toVirtualPath('.', 'a')).toEqual({ ok: true, path: 'a' });
    expect(toVirtualPath('x//y/./z', '')).toEqual({ ok: true, path: 'x/y/z' });
  });

  it('takes an absolute argument relative to the project root', () => {
    expect(toVirtualPath('/etc/x', 'a/b')).toEqual({ ok: true, path: 'etc/x' });
    expect(toVirtualPath('/', 'a')).toEqual({ ok: true, path: '' });
  });

  it('fails for a leading tilde', () => {
    expect(toVirtualPath('~/x', '')).toEqual({ ok: false, error: '~ is not available in the ghost' });
    expect(toVirtualPath('~', 'a').ok).toBe(false);
  });

  it('fails when .. climbs above the root', () => {
    expect(toVirtualPath('..', '')).toEqual({ ok: false, error: 'path escapes the project' });
    expect(toVirtualPath('a/../..', '')).toEqual({ ok: false, error: 'path escapes the project' });
    expect(toVirtualPath('../..', 'a').ok).toBe(false);
    expect(toVirtualPath('/..', 'a').ok).toBe(false);
  });

  it('allows .. that stays inside the root', () => {
    expect(toVirtualPath('../c', 'a/b')).toEqual({ ok: true, path: 'a/c' });
    expect(toVirtualPath('..', 'a')).toEqual({ ok: true, path: '' });
  });

  it('normalizes to NFC', () => {
    expect(toVirtualPath('e\u0301', '')).toEqual({ ok: true, path: '\u00e9' });
  });

  it('never returns dot segments', () => {
    fc.assert(
      fc.property(arbPathArg, arbVirtualPath, (arg, cwd) => {
        const r = toVirtualPath(arg, cwd);
        if (r.ok) {
          expect(r.path.split('/').some((s) => s === '.' || s === '..')).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
