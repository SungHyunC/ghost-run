// Performance tests for the wards judge (task 4.14).
// Requirements 3.9 (glob bound), 10.10 (inspection 2.0 s), 19.11 (evaluation 3.0 s).
//
// The glob bound is deterministic (step counter). The glob wall-clock check is loose and runs only
// in nightly mode. The inspection and evaluation budgets are wall-clock limits taken from the
// requirements and always run. All secret values are fake canaries generated from a fixed seed.
// The ghost-runner caps (16 files, 65,536 bytes each) are NOT implemented here; the regression test
// only builds the largest input the caps allow and passes it to the engine.

import { describe, expect, it } from 'vitest';
import { WardEngine } from '../src/wards.js';
import type { Change, GhostReport, WardSet } from '../src/types.js';
import { globMatches, type StepCounter } from '../src/judge/glob.js';
import { createInspector } from '../src/judge/inspect.js';
import { PBT_MODE } from './pbt-config.js';

const clock = globalThis as unknown as { performance: { now(): number } };
const now = (): number => clock.performance.now();

/** Deterministic xorshift32 PRNG. */
function prng(seed: number): () => number {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A fake canary value of exactly `len` characters. */
function canaryValue(rnd: () => number, tag: string, len: number): string {
  let s = `sk-CANARY-${tag}-`;
  while (s.length < len) s += ALNUM[rnd() % ALNUM.length];
  return s;
}

function randomBytes(rnd: () => number, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = rnd() & 0xff;
  return out;
}

describe('glob step bound (Requirement 3.9)', () => {
  const pattern = 'a*a*a*a*a*a*a*a*b';
  const path = 'a'.repeat(4000);
  const m = 17;
  const n = 4000;

  it('stays within a constant times m * n steps on the adversarial pattern', () => {
    const counter: StepCounter = { steps: 0 };
    expect(globMatches(pattern, path, { counter })).toBe(false);
    expect(counter.steps).toBeGreaterThan(0);
    expect(counter.steps).toBeLessThanOrEqual(2 * m * n);
  });

  it('stays within the bound for a case-insensitive match as well', () => {
    const counter: StepCounter = { steps: 0 };
    expect(globMatches(pattern, path, { caseSensitive: false, counter })).toBe(false);
    expect(counter.steps).toBeLessThanOrEqual(2 * m * n);
  });

  it.runIf(PBT_MODE === 'nightly')('finishes within a loose wall-clock limit (nightly only)', () => {
    const start = now();
    globMatches(pattern, path);
    expect(now() - start).toBeLessThan(1000);
  });
});

function buildPayloads(rnd: () => number, count: number, size: number): Map<string, Uint8Array> {
  const payloads = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) payloads.set(`evt-${i}`, randomBytes(rnd, size));
  return payloads;
}

describe('content inspection (Requirement 10.10)', () => {
  it(
    'inspects 16 payloads of 64 KiB against 256 canaries of 4 KiB within 2.0 s',
    () => {
      const rnd = prng(0x1234abcd);
      const payloads = buildPayloads(rnd, 16, 65_536);
      const canaries: Uint8Array[] = [];
      for (let i = 0; i < 256; i++) canaries.push(asciiBytes(canaryValue(rnd, `c${i}`, 4096)));
      // Plant one canary in one payload so the run also proves detection.
      const planted = payloads.get('evt-7') as Uint8Array;
      planted.set(canaries[200] as Uint8Array, 1000);

      const start = now();
      const hits = createInspector(payloads).hits(canaries);
      const elapsed = now() - start;
      (globalThis as { __perfInspectMs?: number }).__perfInspectMs = elapsed;
      console.log(`[perf] inspection: ${elapsed.toFixed(1)} ms`);

      expect([...hits.keys()]).toEqual(['evt-7']);
      expect(hits.get('evt-7')).toContain('raw');
      expect(elapsed).toBeLessThan(2000);
    },
    30_000,
  );
});

function buildReport(changeCount: number, eventCount: number): GhostReport<unknown> {
  const changes: Change[] = [];
  for (let i = 0; i < changeCount; i++) {
    const kind = i % 3 === 0 ? 'file-created' : i % 3 === 1 ? 'file-overwritten' : 'file-deleted';
    changes.push({ kind, path: `work/dir${i % 50}/file${i}.txt` } as Change);
  }
  const observedEvents = [];
  observedEvents.push({ kind: 'secret-read' as const, path: 'cfg/00/.env', stepIndex: 0 });
  for (let i = 0; i < eventCount - 1; i++) {
    observedEvents.push({
      kind: 'network-attempt' as const,
      destination: `https://host${i}.example.test/upload`,
      stepIndex: 1,
      eventId: `evt-${i % 16}`,
    });
  }
  return {
    snapshots: [],
    changes: [changes],
    effectsOutside: [[]],
    observedEvents,
    variantResults: [],
  };
}

const wardSet: WardSet = {
  wards: [
    { id: 'protect-data', kind: 'path', paths: ['data/**', 'prod/*.db'], deny: ['delete', 'overwrite'] },
    { id: 'rows', kind: 'sql', tables: ['users'], max_rows_lost: 0 },
    { id: 'no-exfil', kind: 'egress', secrets: ['cfg/**'], allow_hosts: ['ok.example.test'] },
  ],
} as unknown as WardSet;

/** An env-style file whose values are canaries of `valueLen` characters, `values` lines, padded to `total` bytes if given. */
function envFile(rnd: () => number, tag: string, values: number, valueLen: number, total?: number): Uint8Array {
  let text = '';
  for (let i = 0; i < values; i++) text += `KEY_${i}=${canaryValue(rnd, `${tag}v${i}`, valueLen)}\n`;
  if (total !== undefined) {
    while (text.length < total) text += `# ${ALNUM[rnd() % ALNUM.length]}\n`;
    text = text.slice(0, total);
  }
  return asciiBytes(text);
}

describe('evaluation (Requirement 19.11)', () => {
  it('evaluates 10,000 changes and 100 events without secret values within 3.0 s', () => {
    const report = buildReport(10_000, 100);
    const start = now();
    const verdict = WardEngine.evaluate(report, wardSet);
    const elapsed = now() - start;
    console.log(`[perf] evaluation (no secret values): ${elapsed.toFixed(1)} ms`);
    expect(verdict.verdict).toBe('block');
    expect(elapsed).toBeLessThan(3000);
  });

  it(
    'evaluates 10,000 changes, 100 events, 16 payloads of 64 KiB and 256 canaries within 3.0 s',
    () => {
      const rnd = prng(0x0badf00d);
      // 16 secret files x 16 values of 4,000 characters = 256 canaries (the engine does not cap files).
      const secretValues = new Map<string, Uint8Array>();
      for (let f = 0; f < 16; f++) {
        const id = String(f).padStart(2, '0');
        secretValues.set(`cfg/${id}/.env`, envFile(rnd, `f${f}`, 16, 4000));
      }
      const payloads = buildPayloads(rnd, 16, 65_536);
      const report = buildReport(10_000, 100);

      const start = now();
      const verdict = WardEngine.evaluate(report, wardSet, { secretValues, payloads });
      const elapsed = now() - start;
      console.log(`[perf] evaluation (256 canaries): ${elapsed.toFixed(1)} ms`);

      expect(verdict.verdict).toBe('block');
      expect(verdict.violations.some((v) => v.wardId === 'protect-data')).toBe(false);
      expect(elapsed).toBeLessThan(3000);
    },
    120_000,
  );

  it(
    'handles the largest input the ghost-runner caps allow (16 files x 65,536 bytes) within 3.0 s',
    () => {
      const rnd = prng(0x5eed1234);
      const secretValues = new Map<string, Uint8Array>();
      for (let f = 0; f < 16; f++) {
        const id = String(f).padStart(2, '0');
        // 15 values of 4,000 characters, padded to exactly 65,536 bytes.
        const bytes = envFile(rnd, `g${f}`, 15, 4000, 65_536);
        expect(bytes.length).toBe(65_536);
        secretValues.set(`cfg/${id}/.env`, bytes);
      }
      const payloads = buildPayloads(rnd, 16, 65_536);
      const report = buildReport(10_000, 100);

      const start = now();
      const verdict = WardEngine.evaluate(report, wardSet, { secretValues, payloads });
      const elapsed = now() - start;
      console.log(`[perf] evaluation (cap-size secrets): ${elapsed.toFixed(1)} ms`);

      expect(['pass', 'warn', 'block']).toContain(verdict.verdict);
      expect(verdict.violations.every((v) => !v.reason.includes('sk-CANARY'))).toBe(true);
      expect(elapsed).toBeLessThan(3000);
    },
    120_000,
  );
});
