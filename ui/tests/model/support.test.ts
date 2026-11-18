import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';
import { CANARY_PREFIX, canaryArb, isCanary } from '../fixtures/canary';
import { isReservedHost, RESERVED_HOSTS } from '../fixtures/hosts';
import { listAttributeNames, listElementNames } from '../support/markup';
import * as fc from 'fast-check';
import { PBT_TIMEOUT } from '../support/pbt-config';

type Env = Record<string, string | undefined>;
const env = (globalThis as unknown as { process: { env: Env } }).process.env;

async function load(mode: string | undefined, seed: string | undefined) {
  const saved = { mode: env['GHOST_PBT_MODE'], seed: env['GHOST_PBT_SEED'] };
  if (mode === undefined) delete env['GHOST_PBT_MODE']; else env['GHOST_PBT_MODE'] = mode;
  if (seed === undefined) delete env['GHOST_PBT_SEED']; else env['GHOST_PBT_SEED'] = seed;
  vi.resetModules();
  try {
    return await import('../support/pbt-config');
  } finally {
    if (saved.mode === undefined) delete env['GHOST_PBT_MODE']; else env['GHOST_PBT_MODE'] = saved.mode;
    if (saved.seed === undefined) delete env['GHOST_PBT_SEED']; else env['GHOST_PBT_SEED'] = saved.seed;
  }
}

afterEach(() => vi.restoreAllMocks());

describe('pbt-config', () => {
  it('Short run uses 100 / 25 runs and a 60 s timeout', async () => {
    const c = await load('short', undefined);
    expect(c.PBT_MODE).toBe('short');
    expect(c.NUM_RUNS_FULL).toBe(100);
    expect(c.NUM_RUNS_DOM).toBe(25);
    expect(c.PBT_TIMEOUT).toBe(60_000);
    expect(c.params('full').numRuns).toBe(100);
    expect(c.params('dom').numRuns).toBe(25);
  });

  it('Nightly run uses 10000 / 500 runs and no timeout', async () => {
    const c = await load('nightly', undefined);
    expect(c.PBT_MODE).toBe('nightly');
    expect(c.NUM_RUNS_FULL).toBe(10_000);
    expect(c.NUM_RUNS_DOM).toBe(500);
    expect(c.PBT_TIMEOUT).toBe(0);
  });

  it('replays the seed from GHOST_PBT_SEED', async () => {
    const a = await load(undefined, '12345');
    const b = await load(undefined, '12345');
    expect(a.PBT_SEED).toBe(12345);
    expect(b.params('full').seed).toBe(12345);
  });

  it('prints the seed line', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await load(undefined, '777');
    expect(log).toHaveBeenCalledWith('PBT seed=777');
  });
});

describe('pbt-stats', () => {
  it('counts and flags unhit buckets from 100 samples on', () => {
    const c = createCounter('t');
    for (let i = 0; i < 100; i++) c.add('pass');
    expect(() => assertBucketsHit(c, ['pass'])).not.toThrow();
    expect(() => assertBucketsHit(c, ['pass', 'warn'])).toThrow(/warn/);
    expect(() => assertBucketsHit(createCounter('e'), ['pass'])).toThrow(/vacuous/);
  });
});

describe('fixtures and markup helpers', () => {
  it('canaries and hosts are fake and reserved', () => {
    fc.assert(fc.property(canaryArb, (v) => v.startsWith(CANARY_PREFIX) && isCanary(v)), { numRuns: 50 });
    expect(RESERVED_HOSTS.every(isReservedHost)).toBe(true);
  }, PBT_TIMEOUT);

  it('lists element and attribute names', () => {
    const html = '<div class="a" data-x="1>2"><span hidden>t</span></div>';
    expect(listElementNames(html)).toEqual(['div', 'span']);
    expect(listAttributeNames('<div class="a" data-x="b"><span hidden>t</span></div>')).toEqual(['class', 'data-x', 'hidden']);
  });
});
