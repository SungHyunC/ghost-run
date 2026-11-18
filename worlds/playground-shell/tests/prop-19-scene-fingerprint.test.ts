import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareCodePoints } from '@ghost-run/core';
import { fingerprintState } from '../src/vfs/fingerprint.js';
import { renderScene } from '../src/vfs/scene.js';
import { ENTRIES_MAX, FILE_MAX } from '../src/shell/limits.js';
import type { PlaygroundState, VirtualProject } from '../src/state.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { arbVirtualProject } from './support/arb-project.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

const toState = (p: VirtualProject): PlaygroundState => ({ entries: { ...p.entries } });

/** True when any value in the tree is a typed array, ArrayBuffer, or a key named `bytes`. */
function containsBytes(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return true;
  if (Array.isArray(value)) return value.some(containsBytes);
  return Object.entries(value).some(([k, v]) => k === 'bytes' || containsBytes(v));
}

describe('generator validity (arbVirtualProject)', () => {
  it('yields canonical paths, existing parents, and entries within limits', () => {
    fc.assert(
      fc.property(arbVirtualProject, (project) => {
        const keys = Object.keys(project.entries);
        expect(keys.length).toBeLessThanOrEqual(ENTRIES_MAX);
        for (const path of keys) {
          expect(path).not.toBe('');
          const segs = path.split('/');
          expect(segs.every((s) => s !== '' && s !== '.' && s !== '..')).toBe(true);
          if (segs.length > 1) {
            expect(project.entries[segs.slice(0, -1).join('/')]).toEqual({ kind: 'dir' });
          }
          const entry = project.entries[path];
          if (entry?.kind === 'file') expect(entry.bytes.byteLength).toBeLessThanOrEqual(FILE_MAX);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Property 19: Scene, state, and fingerprint', () => {
  it(
    'scene round-trips through JSON without bytes; state clones equal; equal states hash equal; one changed byte changes the hash',
    async () => {
      // Feature: ghost-shell, Property 19: Scene, state, and fingerprint
      // **Validates: Requirements 3.7, 3.8, 3.10, 3.11**
      await fc.assert(
        fc.asyncProperty(arbVirtualProject, fc.nat(), fc.integer({ min: 1, max: 255 }), async (project, pick, delta) => {
          const state = toState(project);

          // Scene: JSON round trip, no bytes.
          const scene = renderScene(state, project.name);
          expect(JSON.parse(JSON.stringify(scene))).toEqual(scene);
          expect(containsBytes(scene)).toBe(false);

          // State: structuredClone equality.
          expect(structuredClone(state)).toEqual(state);

          // Fingerprint: equal states give equal hashes.
          const fp = await fingerprintState(state);
          const fpClone = await fingerprintState(structuredClone(state));
          expect(fpClone.hash).toBe(fp.hash);
          expect(fpClone.manifest).toEqual(fp.manifest);
          expect(Object.keys(fp.manifest).sort(compareCodePoints)).toEqual(
            Object.keys(state.entries).sort(compareCodePoints),
          );

          // Changing one byte of one file changes the hash (and only that manifest entry).
          const entries = { ...state.entries };
          let files = Object.keys(entries).filter((p) => {
            const e = entries[p];
            return e?.kind === 'file' && e.bytes.byteLength > 0;
          });
          if (files.length === 0) {
            entries['extra.txt'] = { kind: 'file', bytes: new Uint8Array([0]) };
            files = ['extra.txt'];
          }
          const target = files[pick % files.length] as string;
          const entry = entries[target];
          if (entry?.kind !== 'file') throw new Error('unreachable: target is a file');
          const changed = new Uint8Array(entry.bytes);
          const at = pick % changed.byteLength;
          changed[at] = ((changed[at] as number) + delta) % 256;
          entries[target] = { ...entry, bytes: changed };
          const before = await fingerprintState({
            entries: { ...entries, [target]: entry },
          });
          const after = await fingerprintState({ entries });
          expect(after.hash).not.toBe(before.hash);
          expect(after.manifest[target]).not.toBe(before.manifest[target]);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('regression example: one flipped byte in a nested file changes the hash', async () => {
    const base: PlaygroundState = {
      entries: { a: { kind: 'dir' }, 'a/x.txt': { kind: 'file', bytes: new Uint8Array([1, 2, 3]) } },
    };
    const flipped: PlaygroundState = {
      entries: { a: { kind: 'dir' }, 'a/x.txt': { kind: 'file', bytes: new Uint8Array([1, 2, 4]) } },
    };
    expect((await fingerprintState(base)).hash).not.toBe((await fingerprintState(flipped)).hash);
    expect((await fingerprintState(base)).hash).toBe((await fingerprintState(structuredClone(base))).hash);
  });
});
