// Unit tests for the shared model helpers (numbers, time, escape, guards, texts).
// **Validates: Requirements 2.7, 3.1, 3.2, 3.5, 3.6, 5.6, 6.1, 7.3, 10.3, 14.6**
import { describe, expect, it } from 'vitest';
import { formatCount } from '../../src/model/numbers';
import { parseUtcInstant } from '../../src/model/time';
import { compact, detail, escapeForDisplay } from '../../src/model/escape';
import { displayPrimitive, pick } from '../../src/model/guards';
import {
  ASSURANCE_DOCKER,
  ASSURANCE_PLAYGROUND,
  CANDLE_LABELS,
  STATIC_BANNER,
} from '../../src/model/texts';

const ZWSP = String.fromCodePoint(0x200b);
const ZWJ = String.fromCodePoint(0x200d);
const LONE_HIGH = String.fromCharCode(0xd800);

describe('formatCount', () => {
  it('groups thousands with commas', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1206)).toBe('1,206');
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('rejects negative, fractional, NaN-like, and string input with the escaped raw value', () => {
    expect(formatCount(-1)).toBe('invalid number: -1');
    expect(formatCount(1.5)).toBe('invalid number: 1.5');
    expect(formatCount(Number.NaN)).toBe('invalid number: NaN');
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('invalid number: Infinity');
    expect(formatCount('12')).toBe('invalid number: 12');
    expect(formatCount(`1${ZWSP}2`)).toBe('invalid number: 1<U+200B>2');
    expect(formatCount(undefined)).toBe('invalid number: [non-primitive]');
    expect(formatCount({})).toBe('invalid number: [non-primitive]');
  });

  it('avoids exponent notation for large integers', () => {
    expect(formatCount(1e21)).toBe('1,000,000,000,000,000,000,000');
  });
});

describe('parseUtcInstant', () => {
  it('parses valid forms', () => {
    expect(parseUtcInstant('1970-01-01T00:00:00Z')).toBe(0);
    expect(parseUtcInstant('1970-01-01T00:00:01Z')).toBe(1000);
    expect(parseUtcInstant('1970-01-01T00:00:00.5Z')).toBe(500);
    expect(parseUtcInstant('1970-01-01T00:00:00.05Z')).toBe(50);
    expect(parseUtcInstant('1970-01-01T00:00:00.123Z')).toBe(123);
    expect(parseUtcInstant('2000-01-01T00:00:00Z')).toBe(946684800000);
    expect(parseUtcInstant('2026-12-05T07:00:00Z')).toBe(1796454000000);
    expect(parseUtcInstant('1969-12-31T23:59:59Z')).toBe(-1000);
  });

  it('applies the Gregorian leap-year rule', () => {
    expect(parseUtcInstant('2024-02-29T00:00:00Z')).not.toBeNull();
    expect(parseUtcInstant('2000-02-29T00:00:00Z')).not.toBeNull();
    expect(parseUtcInstant('2023-02-29T00:00:00Z')).toBeNull();
    expect(parseUtcInstant('1900-02-29T00:00:00Z')).toBeNull();
  });

  it('checks day against month length', () => {
    expect(parseUtcInstant('2025-04-30T00:00:00Z')).not.toBeNull();
    expect(parseUtcInstant('2025-04-31T00:00:00Z')).toBeNull();
    expect(parseUtcInstant('2025-01-31T00:00:00Z')).not.toBeNull();
    expect(parseUtcInstant('2025-01-32T00:00:00Z')).toBeNull();
    expect(parseUtcInstant('2025-00-10T00:00:00Z')).toBeNull();
    expect(parseUtcInstant('2025-13-10T00:00:00Z')).toBeNull();
    expect(parseUtcInstant('2025-01-00T00:00:00Z')).toBeNull();
  });

  it('checks hour, minute, and second ranges', () => {
    expect(parseUtcInstant('2025-01-01T23:59:59Z')).not.toBeNull();
    expect(parseUtcInstant('2025-01-01T24:00:00Z')).toBeNull();
    expect(parseUtcInstant('2025-01-01T00:60:00Z')).toBeNull();
    expect(parseUtcInstant('2025-01-01T00:00:60Z')).toBeNull();
  });

  it('rejects the invalid forms of Open Question Q8', () => {
    expect(parseUtcInstant('2025-01-01T00:00:00+00:00')).toBeNull();
    expect(parseUtcInstant('2025-01-01t00:00:00Z')).toBeNull();
    expect(parseUtcInstant('2025-01-01T00:00:00z')).toBeNull();
    expect(parseUtcInstant('2025-01-01 00:00:00Z')).toBeNull();
    expect(parseUtcInstant('2025-01-01T00:00:00')).toBeNull();
    expect(parseUtcInstant('2025-01-01T00:00Z')).toBeNull();
    expect(parseUtcInstant('2025-01-01T00:00:00.Z')).toBeNull();
    expect(parseUtcInstant('2025-01-01T00:00:00.1234Z')).toBeNull();
    expect(parseUtcInstant('2025-1-1T00:00:00Z')).toBeNull();
    expect(parseUtcInstant(' 2025-01-01T00:00:00Z')).toBeNull();
    expect(parseUtcInstant('2025-01-01T00:00:00Z\n')).toBeNull();
    expect(parseUtcInstant('')).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(parseUtcInstant(0)).toBeNull();
    expect(parseUtcInstant(null)).toBeNull();
    expect(parseUtcInstant(undefined)).toBeNull();
    expect(parseUtcInstant({})).toBeNull();
  });

  it('does not call Date', () => {
    const RealDate = globalThis.Date;
    const calls: string[] = [];
    // A stand-in that records any use; restored in finally.
    const Spy = new Proxy(RealDate, {
      construct() {
        calls.push('new');
        throw new Error('Date constructed');
      },
      apply() {
        calls.push('call');
        throw new Error('Date called');
      },
      get(target, prop, receiver) {
        calls.push(String(prop));
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    globalThis.Date = Spy;
    try {
      expect(parseUtcInstant('2024-02-29T12:34:56.789Z')).not.toBeNull();
      expect(parseUtcInstant('not a time')).toBeNull();
    } finally {
      globalThis.Date = RealDate;
    }
    expect(calls).toEqual([]);
  });
});

describe('compact and detail boundaries', () => {
  it('compact keeps exactly 120 code points and cuts 121 to 117 plus "..."', () => {
    const s120 = 'a'.repeat(120);
    expect(compact(s120)).toBe(s120);
    const cut = compact('a'.repeat(121));
    expect(cut).toBe(`${'a'.repeat(117)}...`);
    expect(Array.from(cut)).toHaveLength(120);
  });

  it('compact counts code points, not UTF-16 units', () => {
    const emoji120 = String.fromCodePoint(0x1f600).repeat(120);
    expect(compact(emoji120)).toBe(emoji120);
    expect(compact(emoji120 + 'a')).toBe(`${String.fromCodePoint(0x1f600).repeat(117)}...`);
  });

  it('compact never cuts inside a hex token', () => {
    // 116 letters then a 8-char token: 124 > 120, budget 117 leaves no room for the token.
    const out = compact(`${'a'.repeat(116)}${ZWSP}`);
    expect(out).toBe(`${'a'.repeat(116)}...`);
    expect(out).not.toContain('<U+');
  });

  it('detail keeps exactly 4096 code points and appends [truncated] at 4097', () => {
    const s4096 = 'b'.repeat(4096);
    expect(detail(s4096)).toBe(s4096);
    expect(detail('b'.repeat(4097))).toBe(`${s4096}[truncated]`);
  });

  it('detail keeps newlines, compact escapes them', () => {
    expect(detail('a\nb')).toBe('a\nb');
    expect(compact('a\nb')).toBe('a<U+000A>b');
  });

  it('honors an explicit max', () => {
    expect(compact('abcdef', 5)).toBe('ab...');
    expect(detail('abcdef', 4)).toBe('abcd[truncated]');
  });
});

describe('escapeForDisplay', () => {
  it('escapes a lone surrogate', () => {
    expect(escapeForDisplay(`a${LONE_HIGH}b`)).toBe('a<U+D800>b');
    expect(escapeForDisplay(String.fromCharCode(0xdc00))).toBe('<U+DC00>');
  });

  it('keeps a valid surrogate pair as one code point', () => {
    expect(escapeForDisplay(String.fromCodePoint(0x1f600))).toBe(String.fromCodePoint(0x1f600));
  });

  it('escapes U+200D even between emoji (no emoji exception)', () => {
    const s = `${String.fromCodePoint(0x1f468)}${ZWJ}${String.fromCodePoint(0x1f469)}`;
    expect(escapeForDisplay(s)).toBe(
      `${String.fromCodePoint(0x1f468)}<U+200D>${String.fromCodePoint(0x1f469)}`,
    );
  });

  it('escapes U+000A by default and keeps it with keepNewline', () => {
    expect(escapeForDisplay('a\nb')).toBe('a<U+000A>b');
    expect(escapeForDisplay('a\nb', { keepNewline: false })).toBe('a<U+000A>b');
    expect(escapeForDisplay('a\nb', { keepNewline: true })).toBe('a\nb');
    expect(escapeForDisplay('a\rb', { keepNewline: true })).toBe('a<U+000D>b');
  });

  it('escapes hidden, bidi, tag, and C1 code points with uppercase hex of at least four digits', () => {
    expect(escapeForDisplay(String.fromCodePoint(0xfeff))).toBe('<U+FEFF>');
    expect(escapeForDisplay(String.fromCodePoint(0x202e))).toBe('<U+202E>');
    expect(escapeForDisplay(String.fromCodePoint(0x2066))).toBe('<U+2066>');
    expect(escapeForDisplay(String.fromCodePoint(0xe0041))).toBe('<U+E0041>');
    expect(escapeForDisplay(String.fromCodePoint(0x85))).toBe('<U+0085>');
    expect(escapeForDisplay(String.fromCodePoint(0x7f))).toBe('<U+007F>');
    expect(escapeForDisplay('\u0000')).toBe('<U+0000>');
  });

  it('is idempotent and leaves ordinary text unchanged', () => {
    const s = `plain ${ZWSP} text ${LONE_HIGH}`;
    const once = escapeForDisplay(s);
    expect(escapeForDisplay(once)).toBe(once);
    expect(escapeForDisplay('Hangul \uD55C\uAE00 e\u0301')).toBe('Hangul \uD55C\uAE00 e\u0301');
  });
});

describe('pick', () => {
  it('returns only the named own properties', () => {
    const proto = { inherited: 1 };
    const o = Object.create(proto) as Record<string, unknown>;
    o.a = 1;
    o.b = 2;
    o.c = 3;
    const r = pick(o, 'a', 'c', 'inherited', 'missing');
    expect(r).toEqual({ a: 1, c: 3 });
    expect(Object.keys(r ?? {})).toEqual(['a', 'c']);
  });

  it('does not copy __proto__ unless it is an own property', () => {
    const r = pick({ a: 1 }, '__proto__');
    expect(r).toEqual({});
    expect(Object.getPrototypeOf(r)).toBe(Object.prototype);
  });

  it('returns null for non-records', () => {
    expect(pick(null, 'a')).toBeNull();
    expect(pick(undefined, 'a')).toBeNull();
    expect(pick([1, 2], '0')).toBeNull();
    expect(pick('str', 'length')).toBeNull();
    expect(pick(5, 'a')).toBeNull();
  });

  it('returns null when a getter throws', () => {
    const o = {
      get a(): number {
        throw new Error('boom');
      },
    };
    expect(pick(o, 'a')).toBeNull();
  });
});

describe('displayPrimitive', () => {
  it('shows primitives', () => {
    expect(displayPrimitive('x')).toBe('x');
    expect(displayPrimitive(12)).toBe('12');
    expect(displayPrimitive(true)).toBe('true');
    expect(displayPrimitive(10n)).toBe('10');
    expect(displayPrimitive(null)).toBe('null');
  });

  it('escapes and cuts strings', () => {
    expect(displayPrimitive(`a${ZWSP}`)).toBe('a<U+200B>');
    expect(displayPrimitive('abcdef', 3)).toBe('abc[truncated]');
  });

  it('shows [non-primitive] for objects, arrays, functions, symbols, and undefined', () => {
    expect(displayPrimitive({})).toBe('[non-primitive]');
    expect(displayPrimitive([])).toBe('[non-primitive]');
    expect(displayPrimitive(() => 1)).toBe('[non-primitive]');
    expect(displayPrimitive(Symbol('s'))).toBe('[non-primitive]');
    expect(displayPrimitive(undefined)).toBe('[non-primitive]');
  });
});

describe('fixed texts pinned by the requirements', () => {
  it('candle labels', () => {
    expect(CANDLE_LABELS.lit.text).toBe('PASS');
    expect(CANDLE_LABELS.flickering.text).toBe('WARN');
    expect(CANDLE_LABELS.out.text).toBe('BLOCK');
    expect(CANDLE_LABELS.out.accessible).toBe('Candle out: block.');
  });

  it('static banner', () => {
    expect(STATIC_BANNER).toBe(
      'Static analysis only: no ghost rehearsal took place. P1, P5 and P6 are NOT claimed for this run.',
    );
  });

  it('Assurance_Text strings', () => {
    expect(ASSURANCE_DOCKER).toBe('Ghost ran inside a sealed Docker box (P1 claimed).');
    expect(ASSURANCE_PLAYGROUND).toBe('Ghost ran on an in-memory copy in this browser (P1 claimed).');
  });
});
