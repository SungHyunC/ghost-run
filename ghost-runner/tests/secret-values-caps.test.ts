// [no-docker] secretValues caps: count, size, determinism, no-leak, egress block (task 12.8b).
// Validates: Requirements 9.4, 9.11, 9.15
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WardSet } from '@ghost-run/core';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_SECRET_FILE_BYTES, MAX_SECRET_FILES } from '../src/config.js';
import { loadSecretValues, runPlan } from '../src/pipeline.js';
import type { Diagnostic } from '../src/result.js';
import { cleanRecorderFiles, createFakeDocker } from './fixtures/fake-docker.js';
import { pbtParams, testTimeoutMs } from './pbt-config.js';

// Shuffles directory listings (names only) so the byte-order guarantee is tested against
// arbitrary listing order. `shuffleSeed` undefined = untouched order.
const state = vi.hoisted(() => ({ shuffleSeed: undefined as number | undefined }));
vi.mock('node:fs/promises', async (orig) => {
  const real = await orig<typeof import('node:fs/promises')>();
  const readdir = (async (...args: Parameters<typeof real.readdir>) => {
    const out = await (real.readdir as (...a: unknown[]) => Promise<unknown[]>)(...args);
    if (state.shuffleSeed === undefined) return out;
    let s = state.shuffleSeed >>> 0 || 1;
    const arr = [...out];
    for (let i = arr.length - 1; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [arr[i], arr[j]] = [arr[j] as unknown, arr[i] as unknown];
    }
    return arr;
  }) as typeof real.readdir;
  return { ...real, readdir };
});

const CANARY = 'sk-CANARY-abc123';
const dirs: string[] = [];

function dir(): string {
  const d = mkdtempSync(join(tmpdir(), 'ghost-secretcaps-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  state.shuffleSeed = undefined;
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const egress = (secrets: string[]): WardSet => ({
  wards: [{ id: 'no-exfil', kind: 'egress', secrets, allow_hosts: [] }],
});

const name = (i: number): string => `k${String(i).padStart(3, '0')}.key`;

/** Deterministic alphanumeric filler that cannot collide with JSON structure text. */
function filler(n: number, seed: number): Buffer {
  const alphabet = 'QXZJVKWqxzjvkw0123456789';
  const b = Buffer.alloc(n);
  let s = seed >>> 0 || 7;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    b[i] = alphabet.charCodeAt((s >>> 8) % alphabet.length);
  }
  return b;
}

async function load(root: string, secrets: string[]) {
  const diagnostics: Diagnostic[] = [];
  const map = await loadSecretValues(root, egress(secrets), [], diagnostics);
  return { map, diagnostics };
}

const summary = (map: Map<string, Uint8Array> | undefined, d: Diagnostic[]): string =>
  JSON.stringify({
    files: [...(map ?? new Map()).entries()].map(([k, v]) => [k, Buffer.from(v).toString('hex')]),
    d,
  });

describe('count cap (9.15)', () => {
  it('keeps exactly the first 16 paths in byte order and flags every other file once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 17, max: 24 }),
        fc.integer({ min: 1, max: 2 ** 31 }),
        async (n, seed) => {
          const root = dir();
          state.shuffleSeed = seed;
          // Mixed-case and nested names exercise byte order (uppercase < lowercase).
          const paths = Array.from({ length: n }, (_, i) =>
            i % 3 === 0 ? `sub/${name(i)}` : i % 3 === 1 ? name(i).toUpperCase().replace('.KEY', '.key') : name(i),
          );
          mkdirSync(join(root, 'sub'), { recursive: true });
          paths.forEach((p, i) => writeFileSync(join(root, p), `v${String(i)}`.padEnd(i + 2, '.')));
          const sorted = [...paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
          const { map, diagnostics } = await load(root, ['**/*.key', '*.key']);
          expect([...(map?.keys() ?? [])].sort()).toEqual(sorted.slice(0, MAX_SECRET_FILES).sort());
          expect(diagnostics).toHaveLength(n - MAX_SECRET_FILES);
          for (const p of sorted.slice(MAX_SECRET_FILES)) {
            const len = (await import('node:fs')).statSync(join(root, p)).size;
            expect(diagnostics).toContainEqual({
              name: 'secret-values-capped',
              path: p,
              detail: { reason: 'count', byteLength: len, cap: MAX_SECRET_FILES },
            });
          }
          rmSync(root, { recursive: true, force: true });
        },
      ),
      pbtParams(false),
    );
  }, testTimeoutMs(false));

  it('does not flag exactly 16 files', async () => {
    const root = dir();
    for (let i = 0; i < 16; i++) writeFileSync(join(root, name(i)), 'x');
    const { map, diagnostics } = await load(root, ['*.key']);
    expect(map?.size).toBe(16);
    expect(diagnostics).toEqual([]);
  });

  it('reports 17 files with the single skipped file and its length', async () => {
    const root = dir();
    for (let i = 0; i < 17; i++) writeFileSync(join(root, name(i)), i === 16 ? 'twelve-bytes' : 'x');
    const { map, diagnostics } = await load(root, ['*.key']);
    expect(map?.has(name(16))).toBe(false);
    expect(diagnostics).toEqual([
      { name: 'secret-values-capped', path: name(16), detail: { reason: 'count', byteLength: 12, cap: 16 } },
    ]);
  });
});

describe('size cap (9.15)', () => {
  it.each([
    [MAX_SECRET_FILE_BYTES - 1, false],
    [MAX_SECRET_FILE_BYTES, false],
    [MAX_SECRET_FILE_BYTES + 1, true],
    [MAX_SECRET_FILE_BYTES + 4096, true],
  ])('file of %i bytes: capped diagnostic = %s', async (size, capped) => {
    const root = dir();
    const content = filler(size, size);
    writeFileSync(join(root, 'a.key'), content);
    const { map, diagnostics } = await load(root, ['*.key']);
    const got = Buffer.from(map?.get('a.key') as Uint8Array);
    expect(got.equals(content.subarray(0, MAX_SECRET_FILE_BYTES))).toBe(true);
    expect(diagnostics).toEqual(
      capped
        ? [{ name: 'secret-values-capped', path: 'a.key', detail: { reason: 'size', byteLength: size, cap: MAX_SECRET_FILE_BYTES } }]
        : [],
    );
  });

  it('keeps the first 65,536 bytes for generated sizes above the cap', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20_000 }), fc.integer({ min: 1, max: 1000 }), async (extra, seed) => {
        const root = dir();
        const size = MAX_SECRET_FILE_BYTES + extra;
        const content = filler(size, seed);
        writeFileSync(join(root, 'a.key'), content);
        const { map, diagnostics } = await load(root, ['*.key']);
        expect(Buffer.from(map?.get('a.key') as Uint8Array).equals(content.subarray(0, MAX_SECRET_FILE_BYTES))).toBe(true);
        expect(diagnostics).toEqual([
          { name: 'secret-values-capped', path: 'a.key', detail: { reason: 'size', byteLength: size, cap: MAX_SECRET_FILE_BYTES } },
        ]);
        rmSync(root, { recursive: true, force: true });
      }),
      { ...pbtParams(false), numRuns: Math.min(pbtParams(false).numRuns, 30) },
    );
  }, testTimeoutMs(false));
});

describe('determinism (9.15)', () => {
  it('gives identical selection, truncation and diagnostics across repeated runs and shuffled listings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 22 }),
        fc.array(fc.integer({ min: 0, max: 70_000 }), { minLength: 22, maxLength: 22 }),
        fc.array(fc.integer({ min: 1, max: 2 ** 31 }), { minLength: 3, maxLength: 3 }),
        async (n, sizes, seeds) => {
          const root = dir();
          for (let i = 0; i < n; i++) writeFileSync(join(root, name(i)), filler(sizes[i] as number, i + 1));
          const outs: string[] = [];
          for (const seed of [undefined, undefined, ...seeds]) {
            state.shuffleSeed = seed;
            const { map, diagnostics } = await load(root, ['*.key']);
            outs.push(summary(map, diagnostics));
          }
          expect(new Set(outs).size).toBe(1);
          rmSync(root, { recursive: true, force: true });
        },
      ),
      { ...pbtParams(false), numRuns: Math.min(pbtParams(false).numRuns, 20) },
    );
  }, testTimeoutMs(false));
});

// -- no-leak -------------------------------------------------------------------------

function encodings(window: Buffer): string[] {
  const urlEncoded = [...window].map((b) => `%${b.toString(16).padStart(2, '0')}`).join('');
  return [
    window.toString('latin1'),
    window.toString('base64'),
    window.toString('hex'),
    window.toString('hex').toUpperCase(),
    urlEncoded,
    urlEncoded.toUpperCase(),
    encodeURIComponent(window.toString('latin1')),
  ];
}

function leaks(haystack: string, content: Buffer, from = 0, to = content.length): string | undefined {
  const forms = [content.subarray(from, to)];
  const whole = Buffer.from(CANARY);
  for (const f of [...forms, whole]) {
    for (let i = 0; i + 8 <= f.length; i++) {
      for (const e of encodings(f.subarray(i, i + 8))) if (haystack.includes(e)) return e;
    }
  }
  return undefined;
}

describe('no leak through output channels (9.11)', () => {
  it('keeps skipped-file and truncated-tail content out of every channel', async () => {
    const original = dir();
    writeFileSync(join(original, 'seed.txt'), 'seed\n');
    // 16 small files, then a skipped 17th holding the canary, and a truncated one with a tail canary.
    const small = Buffer.from(`${CANARY}-skipped-QXZJVKW9417`);
    for (let i = 0; i < 15; i++) writeFileSync(join(original, name(i)), 'filler-' + String(i));
    const big = Buffer.concat([filler(MAX_SECRET_FILE_BYTES, 3), Buffer.from(`TAIL-${CANARY}-QXZJVKW7788`)]);
    writeFileSync(join(original, name(15)), big); // 16th, truncated
    writeFileSync(join(original, name(16)), small); // 17th, skipped by count

    const notices: string[] = [];
    const logged: string[] = [];
    const spies = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'debug'),
    ].map((s) => s.mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(' '))));
    const out = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => (logged.push(String(c)), true));
    const err = vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => (logged.push(String(c)), true));

    const client = createFakeDocker({});
    const { result, payloads } = await runPlan([{ command: 'true' }], {
      original,
      client,
      wardSet: egress(['*.key']),
      onNotice: (n) => notices.push(n),
    });
    void spies;
    out.mockRestore();
    err.mockRestore();

    expect(result.diagnostics).toContainEqual({
      name: 'secret-values-capped',
      path: name(16),
      detail: { reason: 'count', byteLength: small.length, cap: 16 },
    });
    expect(result.diagnostics).toContainEqual({
      name: 'secret-values-capped',
      path: name(15),
      detail: { reason: 'size', byteLength: big.length, cap: MAX_SECRET_FILE_BYTES },
    });
    // Diagnostic detail holds only reason, byteLength, cap.
    for (const d of result.diagnostics.filter((x) => x.name === 'secret-values-capped')) {
      expect(Object.keys(d).sort()).toEqual(['detail', 'name', 'path']);
      expect(Object.keys(d.detail as object).sort()).toEqual(['byteLength', 'cap', 'reason']);
    }

    const channels: Record<string, string> = {
      result: JSON.stringify(result),
      diagnostics: JSON.stringify(result.diagnostics),
      notices: JSON.stringify([...notices, ...result.notices]),
      logs: logged.join('\n'),
      // Graveyard entries are built from verdict, ward violations and diagnostics.
      graveyard: JSON.stringify({ verdict: result.verdict, wardVerdict: result.wardVerdict, diagnostics: result.diagnostics }),
      payloads: JSON.stringify([...payloads.values()].map((p) => Buffer.from(p).toString('latin1'))),
    };
    const tailStart = MAX_SECRET_FILE_BYTES - 8;
    for (const [channel, text] of Object.entries(channels)) {
      expect(text, channel).not.toContain(CANARY);
      expect(leaks(text, small), `${channel}: skipped file`).toBeUndefined();
      expect(leaks(text, big, tailStart), `${channel}: truncated tail`).toBeUndefined();
    }
  });

  it('never leaks content of generated capped files into the serialized result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 17, max: 19 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 1000 }),
        async (n, extra, seed) => {
          const original = dir();
          writeFileSync(join(original, 'seed.txt'), 'seed\n');
          const skipped = Buffer.concat([filler(40, seed), Buffer.from(CANARY)]);
          for (let i = 0; i < n; i++) {
            writeFileSync(join(original, name(i)), i === 15 ? Buffer.concat([filler(MAX_SECRET_FILE_BYTES, seed), skipped.subarray(0, 0), filler(extra, seed + 1)]) : i === 16 ? skipped : 'x');
          }
          const { result } = await runPlan([{ command: 'true' }], {
            original,
            client: createFakeDocker({}),
            wardSet: egress(['*.key']),
          });
          const text = JSON.stringify(result);
          expect(text).not.toContain(CANARY);
          expect(leaks(text, skipped)).toBeUndefined();
          const tail = filler(extra, seed + 1);
          expect(leaks(text, tail.subarray(0, Math.min(tail.length, 48)))).toBeUndefined();
          rmSync(original, { recursive: true, force: true });
        },
      ),
      { ...pbtParams(false), numRuns: Math.min(pbtParams(false).numRuns, 20) },
    );
  }, testTimeoutMs(false));
});

// -- egress ward still blocks ----------------------------------------------------------

describe('capped secret file then unapproved network attempt (9.4)', () => {
  const read = (file: string): string => `12 openat(AT_FDCWD, "/work/${file}", O_RDONLY) = 3</work/${file}>\n`;
  const dns = `${JSON.stringify({ host: 'exfil.example', ip: '127.0.0.2', step: 1 })}\n`;

  // The core egress ward matches secret-read paths exactly (no globs), so list the file itself.
  async function run(files: Record<string, Buffer | string>, readFile: string, secrets: string[]) {
    const original = dir();
    writeFileSync(join(original, 'seed.txt'), 'seed\n');
    for (const [p, c] of Object.entries(files)) writeFileSync(join(original, p), c);
    const recorder = {
      files: cleanRecorderFiles(2, { 'step-0.strace': read(readFile), 'dns.jsonl': dns }),
    };
    const { result } = await runPlan([{ command: 'cat secret' }, { command: 'true' }], {
      original,
      client: createFakeDocker({ recorder }),
      wardSet: egress(secrets),
    });
    return result;
  }

  it('blocks via the egress ward and keeps p6Claimed unchanged when the read file was truncated or skipped', async () => {
    const plain = await run({ [name(0)]: 'small' }, name(0), [name(0)]);
    expect(plain.verdict).toBe('block');
    expect(plain.wardVerdict?.violations.map((v) => v.wardId)).toContain('no-exfil');

    const truncated = await run({ [name(0)]: filler(MAX_SECRET_FILE_BYTES + 100, 9) }, name(0), [name(0)]);
    expect(truncated.diagnostics.some((d) => d.name === 'secret-values-capped')).toBe(true);
    expect(truncated.verdict).toBe('block');
    expect(truncated.wardVerdict?.violations.map((v) => v.wardId)).toContain('no-exfil');
    expect(truncated.isolation.p6Claimed).toBe(plain.isolation.p6Claimed);

    const many: Record<string, string> = {};
    for (let i = 0; i < 18; i++) many[name(i)] = `v${String(i)}`;
    const skipped = await run(many, name(17), ['*.key', name(17)]);
    expect(skipped.diagnostics.filter((d) => d.name === 'secret-values-capped')).toHaveLength(2);
    expect(skipped.verdict).toBe('block');
    expect(skipped.wardVerdict?.violations.map((v) => v.wardId)).toContain('no-exfil');
    expect(skipped.isolation.p6Claimed).toBe(plain.isolation.p6Claimed);
  });
});
