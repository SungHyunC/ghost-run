import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWardsFile } from '../src/node.js';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'wards-load-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const VALID = 'wards:\n  - id: keep-env\n    kind: path\n    paths: [".env"]\n    deny: [delete]\n';

describe('loadWardsFile', () => {
  it('loads a valid file', async () => {
    await withDir(async (dir) => {
      const p = join(dir, 'wards.yaml');
      await writeFile(p, VALID, 'utf8');
      const r = await loadWardsFile(p);
      expect(r.ok).toBe(true);
    });
  });

  it('reports a missing file with the path and no line', async () => {
    await withDir(async (dir) => {
      const p = join(dir, 'missing.yaml');
      const r = await loadWardsFile(p);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]?.code).toBe('file-unreadable');
      expect(r.errors[0]?.message).toContain(p);
      expect(r.errors[0]?.line).toBeUndefined();
    });
  });

  it('reports invalid UTF-8 as file-unreadable', async () => {
    await withDir(async (dir) => {
      const p = join(dir, 'bad.yaml');
      await writeFile(p, Uint8Array.from([0x77, 0x61, 0xff, 0xfe, 0x0a]));
      const r = await loadWardsFile(p);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors[0]?.code).toBe('file-unreadable');
      expect(r.errors[0]?.message).toContain(p);
      expect(r.errors[0]?.line).toBeUndefined();
    });
  });

  it('rejects a file over 262,144 bytes as input-too-large', async () => {
    await withDir(async (dir) => {
      const p = join(dir, 'big.yaml');
      await writeFile(p, '');
      await truncate(p, 262_145);
      const r = await loadWardsFile(p);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors.map((e) => e.code)).toEqual(['input-too-large']);
    });
  });

  it('passes parse errors through', async () => {
    await withDir(async (dir) => {
      const p = join(dir, 'broken.yaml');
      await writeFile(p, 'wards: 5\n', 'utf8');
      const r = await loadWardsFile(p);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors[0]?.code).toBe('wards-not-sequence');
    });
  });
});
