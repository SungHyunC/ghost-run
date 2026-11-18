import { describe, expect, it } from 'vitest';
import { loadWardsForHook, resolveWardsFile } from '../lib/wards-file.mjs';

describe('resolveWardsFile', () => {
  const root = '/proj';
  it('uses the environment variable when set', () => {
    expect(resolveWardsFile(root, { GHOST_RUN_WARDS_FILE: '/x/w.yaml' }, () => true)).toBe('/x/w.yaml');
  });
  it('uses <root>/wards.yaml when it exists', () => {
    expect(resolveWardsFile(root, {}, () => true)).toBe('/proj/wards.yaml');
  });
  it('falls back to apps/ghost-shell/wards.yaml', () => {
    const exists = (/** @type {string} */ p) => p === '/proj/apps/ghost-shell/wards.yaml';
    expect(resolveWardsFile(root, {}, exists)).toBe('/proj/apps/ghost-shell/wards.yaml');
  });
});

const wardSet = { wards: [{ id: 'p', kind: 'path', protect: ['x'] }] };

describe('loadWardsForHook', () => {
  it('returns safeCommands when present', async () => {
    const r = await loadWardsForHook('/proj', { GHOST_RUN_WARDS_FILE: '/f' }, async () => ({
      ok: true, wardSet, safeCommands: ['make'], warnings: [],
    }));
    expect(r).toEqual({ ok: true, wardSet, safeCommands: ['make'], file: '/f' });
  });
  it('defaults safeCommands to []', async () => {
    const r = await loadWardsForHook('/proj', { GHOST_RUN_WARDS_FILE: '/f' }, async () => ({
      ok: true, wardSet, warnings: [],
    }));
    expect(r.ok && r.safeCommands).toEqual([]);
  });
  it('limits errors to 5 formatted strings and gives no wardSet', async () => {
    const errors = Array.from({ length: 8 }, (_, i) => ({ code: 'x', message: `m${i}`, line: i + 1 }));
    const r = await loadWardsForHook('/proj', { GHOST_RUN_WARDS_FILE: '/f' }, async () => ({ ok: false, errors }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(5);
      expect(r.errors[0]).toContain('m0');
    }
    expect('wardSet' in r).toBe(false);
  });
  it('reports a missing file with the real loader', async () => {
    const r = await loadWardsForHook('/nonexistent-root-ghost', {});
    expect(r.ok).toBe(false);
  });
  it('turns a throwing loader into ok:false', async () => {
    const r = await loadWardsForHook('/proj', {}, async () => { throw new Error('boom'); });
    expect(r.ok).toBe(false);
  });
});
