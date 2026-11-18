// Feature: ghost-runner, Property 14: Recorder output corruption is detected
// **Validates: Requirements 10.4**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DockerClient, DockerResult } from '../src/docker/cli.js';
import { collectRecorder } from '../src/recorder/collect.js';
import { pbtParams, testTimeoutMs } from './pbt-config.js';

interface Entry {
  readonly name: string;
  readonly body: string;
}

function header(name: string, size: number, type: string): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  h.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

function pad(b: Buffer): Buffer {
  const rem = b.length % 512;
  return rem === 0 ? b : Buffer.concat([b, Buffer.alloc(512 - rem)]);
}

function tar(entries: readonly Entry[]): Buffer {
  const parts: Buffer[] = [header('ghost-rec/', 0, '5')];
  for (const e of entries) {
    const body = Buffer.from(e.body);
    parts.push(header(e.name, body.length, '0'), pad(body));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

function client(stdout: Buffer, code: number | null = 0): DockerClient {
  return {
    run() {
      const r: DockerResult = { code, stdout, stderr: Buffer.alloc(0), timedOut: false };
      return Promise.resolve(r);
    },
  };
}

const marker = (i: number, probe = true): string => JSON.stringify({ end: i, exit: 0, probe });

interface Recording {
  readonly steps: number;
  readonly entries: Entry[];
}

const recordingArb: fc.Arbitrary<Recording> = fc
  .record({
    steps: fc.integer({ min: 1, max: 6 }),
    stracePad: fc.array(fc.constantFrom('', '12 getpid() = 1\n', '13 close(3) = 0\n'), { minLength: 6, maxLength: 6 }),
    dns: fc.array(fc.constantFrom('a.example', 'b.test', 'c.invalid'), { maxLength: 3 }),
  })
  .map(({ steps, stracePad, dns }) => {
    const entries: Entry[] = [];
    for (let i = 0; i < steps; i++) entries.push({ name: `ghost-rec/step-${i}.strace`, body: stracePad[i] as string });
    entries.push({
      name: 'ghost-rec/steps.jsonl',
      body: Array.from({ length: steps }, (_, i) => `${marker(i)}\n`).join(''),
    });
    if (dns.length > 0) {
      entries.push({
        name: 'ghost-rec/dns.jsonl',
        body: dns.map((h) => `{"host":"${h}","ip":"127.0.0.2","step":0}\n`).join(''),
      });
    }
    return { steps, entries };
  });

type Corruption =
  | { kind: 'missing-step'; pick: number }
  | { kind: 'missing-marker'; pick: number }
  | { kind: 'failed-probe'; pick: number }
  | { kind: 'garbled-marker-line'; junk: string }
  | { kind: 'truncated-marker-line' }
  | { kind: 'garbled-dns-line'; junk: string }
  | { kind: 'truncate-tar'; frac: number }
  | { kind: 'bad-checksum' }
  | { kind: 'cp-failed' };

const junkArb = fc.constantFrom('not json', '{"end":', '[1,2]', '{"end":-1}', '{"end":"x"}', '\u0001\u0002garbage');

const corruptionArb: fc.Arbitrary<Corruption> = fc.oneof(
  fc.record({ kind: fc.constant('missing-step' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('missing-marker' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('failed-probe' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('garbled-marker-line' as const), junk: junkArb }),
  fc.constant<Corruption>({ kind: 'truncated-marker-line' }),
  fc.record({ kind: fc.constant('garbled-dns-line' as const), junk: junkArb }),
  fc.record({ kind: fc.constant('truncate-tar' as const), frac: fc.double({ min: 0, max: 1, noNaN: true }) }),
  fc.constant<Corruption>({ kind: 'bad-checksum' }),
  fc.constant<Corruption>({ kind: 'cp-failed' }),
);

/** Apply a corruption; returns the docker stdout and exit code. */
function apply(rec: Recording, c: Corruption): { stdout: Buffer; code: number } {
  const idx = (pick: number): number => pick % rec.steps;
  let entries = rec.entries.map((e) => ({ ...e }));
  const setBody = (suffix: string, f: (b: string) => string): void => {
    const hit = entries.find((e) => e.name.endsWith(suffix));
    if (hit) entries = entries.map((e) => (e === hit ? { ...e, body: f(e.body) } : e));
    else entries.push({ name: `ghost-rec/${suffix}`, body: f('') });
  };
  switch (c.kind) {
    case 'missing-step':
      entries = entries.filter((e) => e.name !== `ghost-rec/step-${idx(c.pick)}.strace`);
      break;
    case 'missing-marker': {
      const drop = idx(c.pick);
      setBody('steps.jsonl', () =>
        Array.from({ length: rec.steps }, (_, i) => i)
          .filter((i) => i !== drop)
          .map((i) => `${marker(i)}\n`)
          .join(''),
      );
      break;
    }
    case 'failed-probe': {
      const bad = idx(c.pick);
      setBody('steps.jsonl', () =>
        Array.from({ length: rec.steps }, (_, i) => `${marker(i, i !== bad)}\n`).join(''),
      );
      break;
    }
    case 'garbled-marker-line':
      setBody('steps.jsonl', (b) => `${b}${c.junk}\n`);
      break;
    case 'truncated-marker-line':
      // cut the file in the middle of the last marker line
      setBody('steps.jsonl', (b) => b.slice(0, b.length - 8));
      break;
    case 'garbled-dns-line':
      setBody('dns.jsonl', (b) => `${b}${c.junk}\n`);
      break;
    case 'cp-failed':
      return { stdout: Buffer.alloc(0), code: 1 };
    case 'truncate-tar': {
      const full = tar(entries);
      // keep fewer bytes than header-through-first-end-block so the end marker is missing
      const limit = full.length - 1024;
      return { stdout: full.subarray(0, Math.floor(c.frac * limit)), code: 0 };
    }
    case 'bad-checksum': {
      const full = Buffer.from(tar(entries));
      full[0] = (full[0] as number) ^ 0x01;
      return { stdout: full, code: 0 };
    }
  }
  return { stdout: tar(entries), code: 0 };
}

const isFailure = (d: { name: string }): boolean => d.name === 'recorder-failure';

describe('Feature: ghost-runner, Property 14: Recorder output corruption is detected', () => {
  it(
    'any corruption of recorder output yields recorder-failure and recorderOk=false',
    async () => {
      await fc.assert(
        fc.asyncProperty(recordingArb, corruptionArb, async (rec, c) => {
          const { stdout, code } = apply(rec, c);
          const r = await collectRecorder(client(stdout, code), 'ghost-x', {
            executedSteps: rec.steps,
            secretPatterns: ['.env'],
          });
          expect(r.recorderOk).toBe(false);
          expect(r.diagnostics.some(isFailure)).toBe(true);
          expect(r.recorder).toEqual({ location: 'in-box', tamperResistant: false });
        }),
        pbtParams(false),
      );
    },
    testTimeoutMs(false),
  );

  it(
    'uncorrupted recorder output yields no recorder-failure and recorderOk=true',
    async () => {
      await fc.assert(
        fc.asyncProperty(recordingArb, async (rec) => {
          const r = await collectRecorder(client(tar(rec.entries)), 'ghost-x', {
            executedSteps: rec.steps,
            secretPatterns: ['.env'],
          });
          expect(r.diagnostics.filter(isFailure)).toEqual([]);
          expect(r.recorderOk).toBe(true);
        }),
        pbtParams(false),
      );
    },
    testTimeoutMs(false),
  );
});
