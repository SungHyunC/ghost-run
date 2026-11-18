import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { float64LittleEndianBytes } from '../../src/hash.js';
import {
  EngineMemoryError,
  MODEL_CACHE_LIMIT,
  NOMINAL_MODEL_PARAMS,
  buildMjcf,
  createEngine,
  readArray,
  withScope,
} from '../../src/engine/engine.js';
import type { Engine } from '../../src/engine/engine.js';
import { loadMujoco } from '../../src/engine/load.js';
import type { Deletable, MuJoCoModule } from '../../src/engine/mujoco-subset.js';

// Engine tests with the real MuJoCo module (no mock).
// Validates: Requirements 3.14, 4.1, 4.2, 4.3, 4.5, 4.6, 17.13.

const MIB = 1024 * 1024;
const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));

let mujoco: MuJoCoModule;
let engine: Engine;

beforeAll(async () => {
  mujoco = await loadMujoco();
  engine = createEngine(mujoco);
}, 60_000);

afterAll(() => {
  engine?.dispose();
});

function ctrlFor(step: number, nu: number): Float64Array {
  const c = new Float64Array(nu);
  for (let i = 0; i < nu; i += 1) c[i] = 0.2 * Math.sin(0.01 * step + i);
  return c;
}

function nuOf(): number {
  // 4 arm position actuators and 2 finger motors
  return 6;
}

describe('MJCF and arena size', () => {
  it('builds with primitive geoms only and no asset file', () => {
    const xml = buildMjcf(NOMINAL_MODEL_PARAMS);
    expect(xml).not.toMatch(/<(asset|mesh|texture|material|hfield|include)\b/);
    expect(xml).not.toMatch(/\bfile\s*=/);
    const types = [...xml.matchAll(/<geom\b[^>]*\btype="([^"]+)"/g)].map((m) => m[1]);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) expect(['box', 'sphere', 'capsule', 'cylinder', 'plane', 'ellipsoid']).toContain(t);
  });

  it('reports an arena of at most 2 MiB', () => {
    const entry = engine.entry(NOMINAL_MODEL_PARAMS);
    const mem = engine.memory(entry);
    expect(mem.modelArenaBytes).toBeGreaterThan(0);
    expect(mem.modelArenaBytes).toBeLessThanOrEqual(2 * MIB);
    expect(mem.dataArenaBytes).toBeLessThanOrEqual(2 * MIB);
    expect(mem.dataBytes).toBeGreaterThan(0);
  });
});

describe('state layout and restore', () => {
  it('integration.subarray(qpos) equals data.qpos copied directly', () => {
    withScope((scope) => {
      const model = mujoco.MjModel.from_xml_string(buildMjcf(NOMINAL_MODEL_PARAMS));
      scope.add(model);
      const data = scope.add(new mujoco.MjData(model));
      for (let i = 0; i < 25; i += 1) mujoco.mj_step(model, data);
      const out = scope.add(new mujoco.DoubleBuffer(engine.layout.total));
      mujoco.mj_getState(model, data, out, mujoco.mjtState['mjSTATE_INTEGRATION']?.value as number);
      const integration = Float64Array.from(out.GetView());
      const { qpos, qvel } = engine.layout;
      const direct = readArray(data, 'qpos', model.nq);
      const directVel = readArray(data, 'qvel', model.nv);
      expect(qpos.length).toBe(model.nq);
      expect(Array.from(integration.subarray(qpos.offset, qpos.offset + qpos.length))).toEqual(Array.from(direct));
      expect(Array.from(integration.subarray(qvel.offset, qvel.offset + qvel.length))).toEqual(Array.from(directVel));
    });
  });

  it('restore round trip is bit-exact over a few hundred steps', () => {
    const entry = engine.entry(NOMINAL_MODEL_PARAMS);
    const nu = nuOf();
    for (let s = 0; s < 40; s += 1) engine.step(entry, ctrlFor(s, nu));
    const saved = engine.capture(entry).integration;
    const run = (): Float64Array[] => {
      const chunks: Float64Array[] = [];
      for (let s = 40; s < 340; s += 1) chunks.push(engine.step(entry, ctrlFor(s, nu)).qposQvel);
      return chunks;
    };
    const first = run();
    const endFirst = engine.capture(entry).integration;
    engine.load(entry, saved);
    expect(float64LittleEndianBytes([engine.capture(entry).integration])).toEqual(float64LittleEndianBytes([saved]));
    const second = run();
    const endSecond = engine.capture(entry).integration;
    expect(float64LittleEndianBytes(second)).toEqual(float64LittleEndianBytes(first));
    expect(float64LittleEndianBytes([endSecond])).toEqual(float64LittleEndianBytes([endFirst]));
  });
});

describe('memory discipline', () => {
  it('readArray throws view-detached on a stale view after heap growth', () => {
    const model = mujoco.MjModel.from_xml_string(buildMjcf(NOMINAL_MODEL_PARAMS));
    try {
      const data = new mujoco.MjData(model);
      try {
        const stale = (data as unknown as { qpos: Float64Array }).qpos;
        expect(stale.length).toBe(model.nq);
        const before = engine.heapBytes();
        const hogs: Deletable[] = [];
        try {
          for (let i = 0; i < 16 && stale.length !== 0; i += 1) hogs.push(new mujoco.DoubleBuffer(2 * MIB));
        } finally {
          for (const h of hogs) h.delete();
        }
        expect(engine.heapBytes()).toBeGreaterThan(before);
        expect(stale.length).toBe(0);
        let caught: unknown;
        try {
          readArray({ qpos: stale }, 'qpos', model.nq);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(EngineMemoryError);
        expect((caught as EngineMemoryError).code).toBe('view-detached');
        // a freshly fetched view is valid again
        expect(readArray(data, 'qpos', model.nq).length).toBe(model.nq);
      } finally {
        data.delete();
      }
    } finally {
      model.delete();
    }
  });

  it('Scope deletes its objects in finally, newest first, even when the body throws', () => {
    const log: string[] = [];
    const item = (name: string): Deletable => ({ delete: () => void log.push(name) });
    expect(() =>
      withScope((scope) => {
        scope.add(item('a'));
        scope.add(item('b'));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(log).toEqual(['b', 'a']);

    let deleted = false;
    const result = withScope((scope) => {
      scope.add({ delete: () => void (deleted = true) });
      return 7;
    });
    expect(result).toBe(7);
    expect(deleted).toBe(true);
  });

  it('dispose is idempotent', () => {
    const local = createEngine(mujoco);
    const entry = local.entry(NOMINAL_MODEL_PARAMS);
    expect(local.cacheSize()).toBeGreaterThan(0);
    local.dispose();
    expect(() => local.dispose()).not.toThrow();
    expect(local.cacheSize()).toBe(0);
    expect(entry.disposed).toBe(true);
    expect(() => local.entry(NOMINAL_MODEL_PARAMS)).toThrow();
  });

  it('the model cache never exceeds 24 entries and deletes evicted models', () => {
    const local = createEngine(mujoco);
    try {
      expect(MODEL_CACHE_LIMIT).toBe(24);
      const nominal = local.entry(NOMINAL_MODEL_PARAMS);
      const entries = [nominal];
      for (let i = 1; i <= 30; i += 1) {
        entries.push(local.entry({ ...NOMINAL_MODEL_PARAMS, drawerFrictionN: 2 + i * 0.1 }));
        expect(local.cacheSize()).toBeLessThanOrEqual(MODEL_CACHE_LIMIT);
      }
      expect(local.cacheSize()).toBe(MODEL_CACHE_LIMIT);
      const evicted = entries.filter((e) => e.disposed);
      expect(evicted.length).toBe(entries.length - MODEL_CACHE_LIMIT);
      expect(entries.slice(0, evicted.length).every((e) => e.disposed)).toBe(true);
      expect(() => local.memory(nominal)).toThrow();
      const last = entries[entries.length - 1];
      expect(last?.disposed).toBe(false);
      expect(local.memory(last as NonNullable<typeof last>).modelArenaBytes).toBeGreaterThan(0);
    } finally {
      local.dispose();
    }
  }, 60_000);
});

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTs(full));
    else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

describe('source scan', () => {
  const files = listTs(srcRoot);

  it('every new mujoco.Mj* is inside a Scope or an EngineEntry', () => {
    let found = 0;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      const rel = relative(srcRoot, file).split(sep).join('/');
      const entryStart = text.indexOf('class Entry implements EngineEntry');
      let entryEnd = -1;
      if (entryStart >= 0) {
        const next = text.indexOf('\nfunction ', entryStart);
        entryEnd = next < 0 ? text.length : next;
      }
      let offset = 0;
      for (const line of lines) {
        const col = line.search(/\bnew\s+\w+\.Mj\w+/);
        if (col >= 0) {
          found += 1;
          const pos = offset + col;
          const inEntry = entryStart >= 0 && pos > entryStart && pos < entryEnd;
          const inScope = /\bscope\.add\(\s*new\s/.test(line);
          expect(inEntry || inScope, `${rel}: ${line.trim()}`).toBe(true);
          expect(rel.startsWith('engine/'), `${rel} creates a MuJoCo object outside engine/`).toBe(true);
        }
        offset += line.length + 1;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('no file outside engine/ imports @mujoco/mujoco', () => {
    for (const file of files) {
      const rel = relative(srcRoot, file).split(sep).join('/');
      if (rel.startsWith('engine/')) continue;
      const text = readFileSync(file, 'utf8');
      expect(text, rel).not.toMatch(/['"]@mujoco\/mujoco(\/[^'"]*)?['"]/);
      expect(text, rel).not.toMatch(/engine\/(load|mujoco-subset)/);
    }
  });
});
