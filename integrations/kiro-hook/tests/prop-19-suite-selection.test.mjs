import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { selectSuites, WORLD_NAME_RE } from '../lib/pbt/select.mjs';
import { NUM_RUNS } from './pbt-config.mjs';

// Feature: kiro-integration, Property 19: Suite selection
// **Validates: Requirements 15.1, 15.3**

const seg = fc.stringMatching(/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,11}$/).filter((s) => s !== '.' && s !== '..');
const rest = fc.array(seg, { minLength: 1, maxLength: 4 });
const worldName = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);
const badWorldName = fc.oneof(
  fc.stringMatching(/^[A-Z][A-Za-z0-9-]{0,10}$/),
  fc.stringMatching(/^[0-9-][a-z0-9-]{0,10}$/),
  fc.stringMatching(/^[a-z][a-z0-9_.]{0,10}[_.][a-z0-9]{0,4}$/),
  fc.constant('a'.repeat(65)),
);
const join = (/** @type {string[]} */ parts) => parts.join('/');
const params = { numRuns: NUM_RUNS, verbose: 1 };

describe('Property 19: Suite selection', () => {
  it('core for paths under core/', () => {
    fc.assert(
      fc.property(rest, (r) => selectSuites(join(['core', ...r])).kind === 'core'),
      params,
    );
  });

  it('world with the exact name for worlds/<valid-name>/...', () => {
    fc.assert(
      fc.property(worldName, rest, (name, r) => {
        const sel = selectSuites(join(['worlds', name, ...r]));
        return sel.kind === 'world' && /** @type {any} */ (sel).world === name;
      }),
      params,
    );
  });

  it('none for look-alike prefixes, bad names, bare folders, and absolute paths', () => {
    const lookAlike = fc.oneof(
      fc.tuple(fc.constantFrom('corex', 'Core', 'core-old', 'cor', 'worlds-old', 'world', 'worldsx', 'xcore'), rest).map(([p, r]) => join([p, ...r])),
      fc.tuple(badWorldName, rest).map(([n, r]) => join(['worlds', n, ...r])),
      worldName.map((n) => `worlds/${n}`),
      fc.constantFrom('core', 'core/', 'worlds', 'worlds/', ''),
      rest.map((r) => `/${join(['core', ...r])}`),
      rest.map((r) => `/${join(['worlds', 'drawer-arm', ...r])}`),
      rest.map((r) => join(['src', ...r])),
    );
    fc.assert(fc.property(lookAlike, (p) => selectSuites(p).kind === 'none'), params);
  });

  it('none when any segment is .., ., or empty, or the path has a backslash or NUL', () => {
    const bad = fc.constantFrom('..', '.', '');
    const withBad = fc
      .tuple(fc.constantFrom('core', 'worlds/drawer-arm'), rest, bad, rest)
      .map(([p, a, b, c]) => join([p, ...a, b, ...c]));
    const other = fc
      .tuple(fc.constantFrom('core', 'worlds/drawer-arm'), rest, fc.constantFrom('\\', '\0'))
      .map(([p, a, ch]) => `${join([p, ...a])}${ch}x`);
    fc.assert(fc.property(fc.oneof(withBad, other), (p) => selectSuites(p).kind === 'none'), params);
  });

  it('is total over arbitrary strings and agrees with the definition', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (p) => {
        const sel = selectSuites(p);
        const parts = p.split('/');
        const clean = !p.includes('\0') && !p.includes('\\') && parts.every((s) => s !== '' && s !== '.' && s !== '..');
        if (sel.kind === 'core') return clean && parts[0] === 'core' && parts.length >= 2;
        if (sel.kind === 'world') return clean && parts[0] === 'worlds' && parts.length >= 3 && WORLD_NAME_RE.test(parts[1] ?? '');
        return true;
      }),
      params,
    );
  });

  it('examples: the tracked cases', () => {
    expect(selectSuites('core/src/index.ts')).toEqual({ kind: 'core' });
    expect(selectSuites('worlds/drawer-arm/src/world.ts')).toEqual({ kind: 'world', world: 'drawer-arm' });
    expect(selectSuites('corex/a.ts')).toEqual({ kind: 'none' });
    expect(selectSuites('worlds-old/a/b.ts')).toEqual({ kind: 'none' });
    expect(selectSuites('core/../README.md')).toEqual({ kind: 'none' });
    expect(selectSuites('/core/a.ts')).toEqual({ kind: 'none' });
    expect(selectSuites(undefined)).toEqual({ kind: 'none' });
  });
});
