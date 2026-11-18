export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface VariantConfig {
  readonly format: 'ghost-hand-variants';
  readonly version: 1;
  readonly defaultCount: number;
  readonly maxCount: number;
  readonly largeCountEnabled: boolean;
  readonly defaultSeed: number;
  readonly ranges: {
    readonly drawerFrictionN: Range;
    readonly drawerMassKg: Range;
    readonly handleOffsetM: { readonly x: Range; readonly y: Range; readonly z: Range };
    readonly sensorNoiseM: Range;
    readonly commandDelaySteps: Range;
  };
}

export type VariantConfigErrorCode =
  | 'invalid-json'
  | 'wrong-type'
  | 'missing-field'
  | 'unknown-field'
  | 'out-of-range'
  | 'input-too-large';

export interface VariantConfigError {
  readonly code: VariantConfigErrorCode;
  readonly message: string;
  /** Dotted path of the offending field; empty string for the whole document. */
  readonly field: string;
}

export type VariantConfigResult =
  | { readonly ok: true; readonly config: VariantConfig }
  | { readonly ok: false; readonly errors: readonly VariantConfigError[] };

export const VARIANT_CONFIG_MAX_BYTES = 64 * 1024;
export const VARIANT_COUNT_LIMIT = 20;
export const SEED_MAX = 4294967295;
export const VARIANT_CONFIG_FORMAT = 'ghost-hand-variants';

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function has(o: Obj, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/** UTF-8 byte length without TextEncoder, for lone surrogates counts 3 bytes. */
function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

class Collector {
  readonly errors: VariantConfigError[] = [];
  add(code: VariantConfigErrorCode, field: string, message: string): void {
    this.errors.push({ code, field, message });
  }
}

/** Returns the object when `v` is one; reports unknown keys. */
function object(c: Collector, v: unknown, path: string, known: readonly string[]): Obj | undefined {
  if (!isObj(v)) {
    c.add('wrong-type', path, 'expected an object');
    return undefined;
  }
  for (const key of Object.keys(v)) {
    if (!known.includes(key)) c.add('unknown-field', join(path, key), `unknown field "${key}"`);
  }
  return v;
}

function required(c: Collector, o: Obj, key: string, path: string): unknown {
  if (!has(o, key)) {
    c.add('missing-field', join(path, key), `missing field "${key}"`);
    return undefined;
  }
  return o[key];
}

function integerIn(c: Collector, v: unknown, path: string, lo: number, hi: number): number | undefined {
  if (typeof v !== 'number') {
    c.add('wrong-type', path, 'expected a number');
    return undefined;
  }
  if (!Number.isInteger(v) || v < lo || v > hi) {
    c.add('out-of-range', path, `expected an integer from ${lo} to ${hi}`);
    return undefined;
  }
  return v + 0; // turns -0 into 0
}

function range(c: Collector, v: unknown, path: string): Range | undefined {
  const o = object(c, v, path, ['min', 'max']);
  if (o === undefined) return undefined;
  const nums: Array<number | undefined> = [];
  for (const key of ['min', 'max']) {
    const raw = required(c, o, key, path);
    if (raw === undefined && !has(o, key)) {
      nums.push(undefined);
    } else if (typeof raw !== 'number') {
      c.add('wrong-type', join(path, key), 'expected a number');
      nums.push(undefined);
    } else if (!Number.isFinite(raw)) {
      c.add('out-of-range', join(path, key), 'bound must be finite');
      nums.push(undefined);
    } else {
      nums.push(raw + 0);
    }
  }
  const [min, max] = nums;
  if (min === undefined || max === undefined) return undefined;
  if (min > max) {
    c.add('out-of-range', path, 'min must not be greater than max');
    return undefined;
  }
  return { min, max };
}

/** Parses Variant_Config JSON text. Never throws. Rebuilds the config from known keys only. */
export function parseVariantConfig(text: string): VariantConfigResult {
  const c = new Collector();
  try {
    if (typeof text !== 'string') {
      c.add('wrong-type', '', 'expected a string');
      return { ok: false, errors: c.errors };
    }
    if (utf8Length(text) > VARIANT_CONFIG_MAX_BYTES) {
      c.add('input-too-large', '', 'input is larger than 64 KiB');
      return { ok: false, errors: c.errors };
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      c.add('invalid-json', '', 'input is not valid JSON');
      return { ok: false, errors: c.errors };
    }
    const root = object(c, json, '', [
      'format',
      'version',
      'defaultCount',
      'maxCount',
      'largeCountEnabled',
      'defaultSeed',
      'ranges',
    ]);
    if (root === undefined) return { ok: false, errors: c.errors };

    const format = required(c, root, 'format', '');
    if (has(root, 'format')) {
      if (typeof format !== 'string') c.add('wrong-type', 'format', 'expected a string');
      else if (format !== VARIANT_CONFIG_FORMAT) c.add('out-of-range', 'format', `expected "${VARIANT_CONFIG_FORMAT}"`);
    }
    const version = required(c, root, 'version', '');
    if (has(root, 'version')) {
      if (typeof version !== 'number') c.add('wrong-type', 'version', 'expected a number');
      else if (version !== 1) c.add('out-of-range', 'version', 'expected version 1');
    }

    const countRaw = required(c, root, 'defaultCount', '');
    const defaultCount = has(root, 'defaultCount') ? integerIn(c, countRaw, 'defaultCount', 1, VARIANT_COUNT_LIMIT) : undefined;
    const maxRaw = required(c, root, 'maxCount', '');
    const maxCount = has(root, 'maxCount') ? integerIn(c, maxRaw, 'maxCount', 1, VARIANT_COUNT_LIMIT) : undefined;
    const largeRaw = required(c, root, 'largeCountEnabled', '');
    let largeCountEnabled: boolean | undefined;
    if (has(root, 'largeCountEnabled')) {
      if (typeof largeRaw !== 'boolean') c.add('wrong-type', 'largeCountEnabled', 'expected a boolean');
      else largeCountEnabled = largeRaw;
    }
    const seedRaw = required(c, root, 'defaultSeed', '');
    const defaultSeed = has(root, 'defaultSeed') ? integerIn(c, seedRaw, 'defaultSeed', 0, SEED_MAX) : undefined;

    const rangesRaw = required(c, root, 'ranges', '');
    let ranges: VariantConfig['ranges'] | undefined;
    if (has(root, 'ranges')) {
      const r = object(c, rangesRaw, 'ranges', [
        'drawerFrictionN',
        'drawerMassKg',
        'handleOffsetM',
        'sensorNoiseM',
        'commandDelaySteps',
      ]);
      if (r !== undefined) {
        const friction = has(r, 'drawerFrictionN') ? range(c, r.drawerFrictionN, 'ranges.drawerFrictionN') : (required(c, r, 'drawerFrictionN', 'ranges'), undefined);
        const mass = has(r, 'drawerMassKg') ? range(c, r.drawerMassKg, 'ranges.drawerMassKg') : (required(c, r, 'drawerMassKg', 'ranges'), undefined);
        const noise = has(r, 'sensorNoiseM') ? range(c, r.sensorNoiseM, 'ranges.sensorNoiseM') : (required(c, r, 'sensorNoiseM', 'ranges'), undefined);
        let delay = has(r, 'commandDelaySteps') ? range(c, r.commandDelaySteps, 'ranges.commandDelaySteps') : (required(c, r, 'commandDelaySteps', 'ranges'), undefined);
        // The delay is a whole number of steps (Req 6.1), so the range must hold one.
        if (delay !== undefined && Math.ceil(delay.min) > Math.floor(delay.max)) {
          c.add('out-of-range', 'ranges.commandDelaySteps', 'range must contain a whole number of steps');
          delay = undefined;
        }
        let offset: { x: Range; y: Range; z: Range } | undefined;
        if (!has(r, 'handleOffsetM')) {
          required(c, r, 'handleOffsetM', 'ranges');
        } else {
          const h = object(c, r.handleOffsetM, 'ranges.handleOffsetM', ['x', 'y', 'z']);
          if (h !== undefined) {
            const parts: Array<Range | undefined> = [];
            for (const axis of ['x', 'y', 'z']) {
              if (!has(h, axis)) {
                required(c, h, axis, 'ranges.handleOffsetM');
                parts.push(undefined);
              } else {
                parts.push(range(c, h[axis], `ranges.handleOffsetM.${axis}`));
              }
            }
            const [x, y, z] = parts;
            if (x !== undefined && y !== undefined && z !== undefined) offset = { x, y, z };
          }
        }
        if (friction && mass && noise && delay && offset) {
          ranges = {
            drawerFrictionN: friction,
            drawerMassKg: mass,
            handleOffsetM: offset,
            sensorNoiseM: noise,
            commandDelaySteps: delay,
          };
        }
      }
    }

    if (
      c.errors.length > 0 ||
      defaultCount === undefined ||
      maxCount === undefined ||
      largeCountEnabled === undefined ||
      defaultSeed === undefined ||
      ranges === undefined
    ) {
      return { ok: false, errors: c.errors };
    }
    return {
      ok: true,
      config: {
        format: VARIANT_CONFIG_FORMAT,
        version: 1,
        defaultCount,
        maxCount,
        largeCountEnabled,
        defaultSeed,
        ranges,
      },
    };
  } catch {
    return { ok: false, errors: [{ code: 'invalid-json', field: '', message: 'input could not be parsed' }] };
  }
}

function rangeJson(r: Range): { min: number; max: number } {
  return { min: r.min, max: r.max };
}

/** Canonical JSON: two-space indent, fixed key order, trailing newline. */
export function printVariantConfig(config: VariantConfig): string {
  const g = config.ranges;
  const ordered = {
    format: config.format,
    version: config.version,
    defaultCount: config.defaultCount,
    maxCount: config.maxCount,
    largeCountEnabled: config.largeCountEnabled,
    defaultSeed: config.defaultSeed,
    ranges: {
      drawerFrictionN: rangeJson(g.drawerFrictionN),
      drawerMassKg: rangeJson(g.drawerMassKg),
      handleOffsetM: {
        x: rangeJson(g.handleOffsetM.x),
        y: rangeJson(g.handleOffsetM.y),
        z: rangeJson(g.handleOffsetM.z),
      },
      sensorNoiseM: rangeJson(g.sensorNoiseM),
      commandDelaySteps: rangeJson(g.commandDelaySteps),
    },
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
