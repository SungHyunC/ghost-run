import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WORLD_CONFIG } from '@ghost-run/drawer-arm';
import {
  ECHO_LIMIT,
  KNOWN_CLOUD,
  KNOWN_SHELL,
  TEXT_LIMIT,
  echo,
  normalizeSliders,
  normalizeText,
} from '../../src/live/input';

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const cp = (n: number): string => String.fromCodePoint(n);

describe('normalizeText', () => {
  it('rejects empty and space-only text', () => {
    expect(normalizeText('')).toEqual({ ok: false, problem: 'empty' });
    expect(normalizeText('    ')).toEqual({ ok: false, problem: 'empty' });
  });

  it('trims leading and trailing spaces and keeps the rest unchanged', () => {
    expect(normalizeText('  ls -a  ')).toEqual({ ok: true, text: 'ls -a' });
    expect(normalizeText('a  b')).toEqual({ ok: true, text: 'a  b' });
  });

  it('accepts 256 code points and rejects 257', () => {
    expect(normalizeText('a'.repeat(TEXT_LIMIT)).ok).toBe(true);
    expect(normalizeText('a'.repeat(TEXT_LIMIT + 1))).toEqual({ ok: false, problem: 'too-long' });
  });

  it('counts code points, not UTF-16 units, at the limit', () => {
    const pair = cp(0x1f47b);
    expect(pair.length).toBe(2);
    expect(normalizeText('a'.repeat(TEXT_LIMIT - 1) + pair).ok).toBe(true);
    expect(normalizeText('a'.repeat(TEXT_LIMIT) + pair)).toEqual({ ok: false, problem: 'too-long' });
  });

  it('rejects control characters, including tab and newline inside the text', () => {
    for (const c of [0x00, 0x09, 0x0a, 0x1f, 0x7f, 0x9f]) {
      expect(normalizeText(`ls${cp(c)}-a`)).toEqual({ ok: false, problem: 'invalid-character' });
    }
    expect(normalizeText(`${cp(0x09)}ls`)).toEqual({ ok: false, problem: 'invalid-character' });
  });

  it('rejects hidden code points, also at the ends', () => {
    for (const c of [0xe0041, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202e, 0x2066, 0x2069]) {
      expect(normalizeText(`ls${cp(c)}`)).toEqual({ ok: false, problem: 'invalid-character' });
      expect(normalizeText(`${cp(c)}ls`)).toEqual({ ok: false, problem: 'invalid-character' });
    }
  });

  it('rejects an unpaired surrogate and accepts plain non-ASCII text', () => {
    expect(normalizeText('ls \ud800')).toEqual({ ok: false, problem: 'invalid-character' });
    expect(normalizeText('ls \uD55C\uAE00')).toEqual({ ok: true, text: 'ls \uD55C\uAE00' });
  });
});

describe('normalizeSliders', () => {
  const r = WORLD_CONFIG.actionRanges;

  it('keeps in-range values and rounds to the step', () => {
    expect(normalizeSliders({ speed: 0.6, force: 20, distance: 0.2 })).toEqual({
      ok: true,
      values: { speed: 0.6, force: 20, distance: 0.2 },
    });
    expect(normalizeSliders({ speed: 0.15000000000000002, force: 15.4, distance: 0.154 })).toEqual({
      ok: true,
      values: { speed: 0.15, force: 15, distance: 0.15 },
    });
  });

  it('clamps just below and above each range', () => {
    expect(normalizeSliders({ speed: r.speed[0] - 0.01, force: r.force[0] - 1, distance: r.distance[0] - 0.01 })).toEqual({
      ok: true,
      values: { speed: r.speed[0], force: r.force[0], distance: r.distance[0] },
    });
    expect(normalizeSliders({ speed: r.speed[1] + 0.01, force: r.force[1] + 1, distance: r.distance[1] + 0.01 })).toEqual({
      ok: true,
      values: { speed: r.speed[1], force: r.force[1], distance: r.distance[1] },
    });
  });

  it('rejects NaN and infinity', () => {
    expect(normalizeSliders({ speed: Number.NaN, force: 20, distance: 0.2 })).toEqual({ ok: false, problem: 'out-of-range' });
    expect(normalizeSliders({ speed: 0.2, force: Number.POSITIVE_INFINITY, distance: 0.2 })).toEqual({ ok: false, problem: 'out-of-range' });
    expect(normalizeSliders({ speed: 0.2, force: 20, distance: Number.NEGATIVE_INFINITY })).toEqual({ ok: false, problem: 'out-of-range' });
  });
});

describe('echo', () => {
  it('shows hidden and control code points as <U+XXXX>', () => {
    expect(echo(`a${cp(0x200b)}b${cp(0xe0041)}${cp(0x07)}`)).toBe('a<U+200B>b<U+E0041><U+0007>');
  });

  it('leaves short plain text alone', () => {
    expect(echo('ls -a')).toBe('ls -a');
  });

  it('cuts at 80 code points and appends an ellipsis', () => {
    expect(echo('a'.repeat(ECHO_LIMIT))).toBe('a'.repeat(ECHO_LIMIT));
    expect(echo('a'.repeat(ECHO_LIMIT + 1))).toBe(`${'a'.repeat(ECHO_LIMIT)}\u2026`);
  });

  it('never cuts inside a notation', () => {
    const out = echo('a'.repeat(ECHO_LIMIT - 3) + cp(0x200b));
    expect(out).toBe(`${'a'.repeat(ECHO_LIMIT - 3)}\u2026`);
  });
});

describe('known command lists', () => {
  it('KNOWN_SHELL equals the keys of the handler table of the world', () => {
    const src = read('../../../worlds/playground-shell/src/shell/commands/index.ts');
    const keys = [...src.matchAll(/^\s*\['([a-z0-9]+)',/gm)].map((m) => m[1]);
    expect(keys).toHaveLength(15);
    expect([...KNOWN_SHELL]).toEqual(keys);
  });

  it('KNOWN_SHELL equals the Supported_Command_Set table of the app README', () => {
    const readme = read('../../../apps/ghost-shell/README.md');
    const section = readme.split('## Supported_Command_Set')[1]?.split('\n## ')[0] ?? '';
    const rows = section.split('\n').filter((l) => /^\| `/.test(l));
    const names = rows.flatMap((l) => [...(l.split('|')[1] ?? '').matchAll(/`([a-z0-9]+)`/g)].map((m) => m[1]));
    expect([...names].sort()).toEqual([...KNOWN_SHELL].sort());
  });

  it('KNOWN_CLOUD equals the command cases of the parser', () => {
    const src = read('../../../worlds/ghost-cloud/src/parse.ts');
    const s3 = src.split('function parseS3(')[1]?.split('function parseS3Api(')[0] ?? '';
    const s3api = src.split('function parseS3Api(')[1]?.split('/** Total: never throws')[0] ?? '';
    const labels = (text: string): string[] => [...text.matchAll(/^\s{4}case '([a-z-]+)':/gm)].map((m) => m[1] as string);
    const expected = [...labels(s3).map((l) => `aws s3 ${l}`), ...labels(s3api).map((l) => `aws s3api ${l}`)];
    expect(expected).toHaveLength(8);
    expect([...KNOWN_CLOUD]).toEqual(expected);
  });
});
