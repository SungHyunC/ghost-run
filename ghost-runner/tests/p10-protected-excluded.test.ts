// Feature: ghost-runner, Property 10: Protected paths inside excluded directories are flagged
// Validates: Requirements 4.11
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import type { Ward, WardSet } from '@ghost-run/core';
import type { ExcludedDirMode } from '../src/config.js';
import {
  detectProtectedPathExcluded,
  protectedPathExcludedDiagnostics,
  runnerVerdict,
} from '../src/verdict.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

let executed = 0;
afterAll(() => {
  console.log(`Property 10 runs executed: ${executed} (mode=${PBT_MODE}, numRuns=${NUM_RUNS})`);
});

const name = fc.constantFrom('node_modules', '.git', 'dist', 'vendor', 'build', 'cache', 'src', 'lib', 'a', 'b');
const wildcardSeg = fc.constantFrom('*', '**', '*.pem', '?', 'n*', '*_modules', '{dist,build}', '[a-z]x');
const segment = fc.oneof({ weight: 3, arbitrary: name }, { weight: 1, arbitrary: wildcardSeg });
const globArb = fc
  .array(segment, { minLength: 1, maxLength: 5 })
  .map((segs) => segs.join('/'));

const pathWard = fc
  .record({
    id: fc.stringMatching(/^[a-z]{1,6}$/),
    paths: fc.array(globArb, { minLength: 0, maxLength: 4 }),
  })
  .map((r): Ward => ({ id: r.id, kind: 'path', deny: ['delete', 'overwrite'], paths: r.paths }));
const otherWard = fc.constantFrom<Ward>(
  { id: 'sqlw', kind: 'sql', tables: ['node_modules'], max_rows_lost: 0 },
  { id: 'egw', kind: 'egress', secrets: ['dist/x'], allow_hosts: [] },
);
const wardSetArb = fc
  .array(fc.oneof(pathWard, otherWard), { maxLength: 5 })
  .map((wards): WardSet => ({ wards }));
const excludeArb = fc.uniqueArray(name, { maxLength: 4 });
const modeArb = fc.constantFrom<ExcludedDirMode>('omit', 'readonly-mount');

function expected(ws: WardSet, ex: readonly string[]): { wardId: string; path: string }[] {
  const out: { wardId: string; path: string }[] = [];
  for (const w of ws.wards) {
    if (w.kind !== 'path') continue;
    for (const p of w.paths) {
      if (p.split('/').some((s) => ex.includes(s))) out.push({ wardId: w.id, path: p });
    }
  }
  return out;
}

describe('Property 10: Protected paths inside excluded directories are flagged', () => {
  it(
    'flags exactly the (ward id, path) pairs with an excluded directory segment, in both modes, with verdict >= warn',
    () => {
      fc.assert(
        fc.property(wardSetArb, excludeArb, modeArb, (ws, ex, mode) => {
          executed++;
          const found = detectProtectedPathExcluded(ws, ex, mode);
          const want = expected(ws, ex);
          expect(found).toEqual(want);
          // Same result in the other mode.
          const other: ExcludedDirMode = mode === 'omit' ? 'readonly-mount' : 'omit';
          expect(detectProtectedPathExcluded(ws, ex, other)).toEqual(want);

          const diags = protectedPathExcludedDiagnostics(found);
          expect(diags).toHaveLength(want.length);
          diags.forEach((d, i) => {
            expect(d.name).toBe('protected-path-excluded');
            expect(d.path).toBe(want[i]?.path);
            expect(d.detail?.['wardId']).toBe(want[i]?.wardId);
          });

          const v = runnerVerdict({ status: 'ok', mode: 'docker-box', wardVerdict: 'pass', diagnostics: diags });
          if (want.length > 0) expect(v).not.toBe('pass');
          else expect(v).toBe('pass');
        }),
        pbtParams(false),
      );
    },
    testTimeoutMs(false),
  );

  it('does not flag wildcard-only globs such as **/*.pem', () => {
    const ws: WardSet = { wards: [{ id: 'w', kind: 'path', deny: ['delete'], paths: ['**/*.pem', '*'] }] };
    expect(detectProtectedPathExcluded(ws, ['node_modules'], 'omit')).toEqual([]);
    expect(detectProtectedPathExcluded(undefined, ['node_modules'], 'omit')).toEqual([]);
  });

  it('flags node_modules/.bin/tool when node_modules is excluded', () => {
    const ws: WardSet = { wards: [{ id: 'w', kind: 'path', deny: ['delete'], paths: ['node_modules/.bin/tool'] }] };
    expect(detectProtectedPathExcluded(ws, ['node_modules'], 'readonly-mount')).toEqual([
      { wardId: 'w', path: 'node_modules/.bin/tool' },
    ]);
  });
});
