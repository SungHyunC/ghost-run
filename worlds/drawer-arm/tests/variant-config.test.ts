import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseVariantConfig,
  printVariantConfig,
  VARIANT_CONFIG_MAX_BYTES,
  VARIANT_COUNT_LIMIT,
} from '../src/variant-config.js';
import type { VariantConfigErrorCode } from '../src/variant-config.js';

// Validates: Requirements 7.1, 7.2, 7.3, 6.2, 6.3

const shippedText = readFileSync(fileURLToPath(new URL('../variant-config.json', import.meta.url)), 'utf8');

function base(): Record<string, any> {
  return JSON.parse(shippedText) as Record<string, any>;
}

function errorsOf(doc: unknown): { code: VariantConfigErrorCode; field: string }[] {
  const r = parseVariantConfig(typeof doc === 'string' ? doc : JSON.stringify(doc));
  if (r.ok) throw new Error('expected failure');
  return r.errors.map((e) => ({ code: e.code, field: e.field }));
}

describe('shipped variant-config.json', () => {
  it('parses with ok: true', () => {
    expect(parseVariantConfig(shippedText).ok).toBe(true);
  });

  it('has default count 8 and a largest allowed count of at most 20', () => {
    const r = parseVariantConfig(shippedText);
    if (!r.ok) throw new Error('not ok');
    expect(r.config.defaultCount).toBe(8);
    expect(r.config.maxCount).toBeLessThanOrEqual(20);
    expect(VARIANT_COUNT_LIMIT).toBeLessThanOrEqual(20);
    expect(r.config.defaultCount).toBeLessThanOrEqual(r.config.maxCount);
  });

  it('is in canonical print form', () => {
    const r = parseVariantConfig(shippedText);
    if (!r.ok) throw new Error('not ok');
    const printed = printVariantConfig(r.config);
    const again = parseVariantConfig(printed);
    expect(again).toEqual(r);
    expect(printVariantConfig((again as { config: typeof r.config }).config)).toBe(printed);
  });
});

describe('parseVariantConfig errors', () => {
  it('invalid-json at the document', () => {
    expect(errorsOf('{ nope')).toEqual([{ code: 'invalid-json', field: '' }]);
  });

  it('wrong-type for a non-object root', () => {
    expect(errorsOf('[]')).toEqual([{ code: 'wrong-type', field: '' }]);
    expect(errorsOf('7')).toEqual([{ code: 'wrong-type', field: '' }]);
  });

  it('wrong-type for a non-string input', () => {
    const r = parseVariantConfig(5 as unknown as string);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'wrong-type', field: '' });
  });

  it('missing-field with the field path', () => {
    const a = base();
    delete a.defaultSeed;
    expect(errorsOf(a)).toEqual([{ code: 'missing-field', field: 'defaultSeed' }]);
    const b = base();
    delete b.ranges.handleOffsetM.y;
    expect(errorsOf(b)).toEqual([{ code: 'missing-field', field: 'ranges.handleOffsetM.y' }]);
    const c = base();
    delete c.ranges.sensorNoiseM.max;
    expect(errorsOf(c)).toEqual([{ code: 'missing-field', field: 'ranges.sensorNoiseM.max' }]);
    const d = base();
    delete d.ranges;
    expect(errorsOf(d)).toEqual([{ code: 'missing-field', field: 'ranges' }]);
  });

  it('wrong-type with the field path', () => {
    const a = base();
    a.defaultCount = '8';
    expect(errorsOf(a)).toEqual([{ code: 'wrong-type', field: 'defaultCount' }]);
    const b = base();
    b.largeCountEnabled = 1;
    expect(errorsOf(b)).toEqual([{ code: 'wrong-type', field: 'largeCountEnabled' }]);
    const c = base();
    c.ranges.drawerMassKg.min = 'x';
    expect(errorsOf(c)).toEqual([{ code: 'wrong-type', field: 'ranges.drawerMassKg.min' }]);
    const d = base();
    d.ranges.handleOffsetM = 3;
    expect(errorsOf(d)).toEqual([{ code: 'wrong-type', field: 'ranges.handleOffsetM' }]);
    const e = base();
    e.format = 5;
    expect(errorsOf(e)).toEqual([{ code: 'wrong-type', field: 'format' }]);
  });

  it('out-of-range with the field path', () => {
    const cases: [(c: Record<string, any>) => void, string][] = [
      [(c) => (c.format = 'other'), 'format'],
      [(c) => (c.version = 2), 'version'],
      [(c) => (c.defaultCount = 0), 'defaultCount'],
      [(c) => (c.defaultCount = 21), 'defaultCount'],
      [(c) => (c.defaultCount = 2.5), 'defaultCount'],
      [(c) => (c.maxCount = 21), 'maxCount'],
      [(c) => (c.defaultSeed = -1), 'defaultSeed'],
      [(c) => (c.defaultSeed = 4294967296), 'defaultSeed'],
      [(c) => ((c.ranges.drawerFrictionN.min = 5), (c.ranges.drawerFrictionN.max = 1)), 'ranges.drawerFrictionN'],
      [(c) => ((c.ranges.handleOffsetM.z.min = 1), (c.ranges.handleOffsetM.z.max = 0)), 'ranges.handleOffsetM.z'],
      // The delay is a whole number of steps, so its range must contain one (Req 6.1, 6.4).
      [(c) => ((c.ranges.commandDelaySteps.min = 0.2), (c.ranges.commandDelaySteps.max = 0.8)), 'ranges.commandDelaySteps'],
    ];
    for (const [mutate, field] of cases) {
      const d = base();
      mutate(d);
      expect(errorsOf(d)).toEqual([{ code: 'out-of-range', field }]);
    }
  });

  it('accepts a delay range whose bounds are not whole numbers but contain one', () => {
    const d = base();
    d.ranges.commandDelaySteps = { min: 0.5, max: 1.5 };
    expect(parseVariantConfig(JSON.stringify(d)).ok).toBe(true);
  });

  it('out-of-range for a non-finite bound written as a large literal', () => {
    const text = shippedText.replace('"max": 4 }', '"max": 1e999 }');
    expect(text).not.toBe(shippedText);
    expect(errorsOf(text)).toEqual([{ code: 'out-of-range', field: 'ranges.drawerFrictionN.max' }]);
  });

  it('unknown-field at root, ranges, and range level', () => {
    const a = base();
    a.extra = 1;
    expect(errorsOf(a)).toEqual([{ code: 'unknown-field', field: 'extra' }]);
    const b = base();
    b.ranges.gravity = {};
    expect(errorsOf(b)).toEqual([{ code: 'unknown-field', field: 'ranges.gravity' }]);
    const c = base();
    c.ranges.handleOffsetM.x.step = 1;
    expect(errorsOf(c)).toEqual([{ code: 'unknown-field', field: 'ranges.handleOffsetM.x.step' }]);
  });

  it('input-too-large above 64 KiB, accepted at exactly the limit', () => {
    expect(VARIANT_CONFIG_MAX_BYTES).toBe(65536);
    const big = shippedText + ' '.repeat(VARIANT_CONFIG_MAX_BYTES);
    expect(errorsOf(big)).toEqual([{ code: 'input-too-large', field: '' }]);
    const exact = shippedText + ' '.repeat(VARIANT_CONFIG_MAX_BYTES - Buffer.byteLength(shippedText, 'utf8'));
    expect(Buffer.byteLength(exact, 'utf8')).toBe(VARIANT_CONFIG_MAX_BYTES);
    expect(parseVariantConfig(exact).ok).toBe(true);
    expect(parseVariantConfig(exact + ' ').ok).toBe(false);
  });

  it('counts bytes, not characters', () => {
    // 3 bytes per U+20AC: 21846 characters is 65538 bytes but under 64 Ki characters.
    const text = '"' + '\u20AC'.repeat(21846) + '"';
    expect(errorsOf(text)).toEqual([{ code: 'input-too-large', field: '' }]);
  });

  it('collects several errors in one pass', () => {
    const a = base();
    a.extra = 1;
    delete a.defaultSeed;
    expect(errorsOf(a)).toHaveLength(2);
  });
});

describe('printVariantConfig', () => {
  it('uses two-space indent, fixed key order, and one trailing newline', () => {
    const r = parseVariantConfig(shippedText);
    if (!r.ok) throw new Error('not ok');
    const out = printVariantConfig(r.config);
    expect(out.endsWith('}\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
    expect(out.split('\n')[1]).toBe('  "format": "ghost-hand-variants",');
    expect(out).toContain('\n    "drawerFrictionN": {\n      "min": 0.5,\n      "max": 4\n    },');
    const order = (o: object): string[] => Object.keys(o);
    const parsed = JSON.parse(out) as Record<string, any>;
    expect(order(parsed)).toEqual([
      'format',
      'version',
      'defaultCount',
      'maxCount',
      'largeCountEnabled',
      'defaultSeed',
      'ranges',
    ]);
    expect(order(parsed.ranges)).toEqual([
      'drawerFrictionN',
      'drawerMassKg',
      'handleOffsetM',
      'sensorNoiseM',
      'commandDelaySteps',
    ]);
    expect(order(parsed.ranges.handleOffsetM)).toEqual(['x', 'y', 'z']);
    expect(order(parsed.ranges.drawerMassKg)).toEqual(['min', 'max']);
  });

  it('prints the same text for a config parsed from shuffled keys', () => {
    const shuffled = JSON.stringify({ ranges: base().ranges, defaultSeed: 42, largeCountEnabled: false, maxCount: 20, defaultCount: 8, version: 1, format: 'ghost-hand-variants' });
    const a = parseVariantConfig(shuffled);
    const b = parseVariantConfig(shippedText);
    if (!a.ok || !b.ok) throw new Error('not ok');
    expect(printVariantConfig(a.config)).toBe(printVariantConfig(b.config));
  });
});
