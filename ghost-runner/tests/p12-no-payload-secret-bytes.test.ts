// Feature: ghost-runner, Property 12: Serialized output never contains payload or secret bytes
// Validates: Requirements 8.11, 8.14, 8.15, 9.4, 9.11, 9.12, 9.15, 18.6
//
// Note: ghost-runner has no graveyard-output function yet, so the graveyard channel is
// not exercised here. Tested channels: serialized RunResult (which embeds diagnostics,
// notices, and captures), plus diagnostics and notices serialized on their own.
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  SECRET_VALUES_CAPPED,
  parseRunResult,
  serializeRunResult,
  type Diagnostic,
  type RunOutput,
  type RunResult,
} from '../src/result.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

const CANARY = 'sk-CANARY-abc123';
const enc = new TextEncoder();
const dec = new TextDecoder();

let executed = 0;

// Upper-case-only alphabets never occur in the lower-case strings used elsewhere.
const upper = (chars: string) =>
  fc.array(fc.constantFrom(...chars.split('')), { minLength: 0, maxLength: 40 }).map((a) => a.join(''));
const lower = fc.stringMatching(/^[a-z0-9 ./_-]{0,24}$/);

const secretContent = fc
  .tuple(upper('XQZJWV0123456789'), upper('XQZJWV0123456789'))
  .map(([a, b]) => `${a}${CANARY}${b}`);
const payloadFiller = upper('PMKHGF');

const runOutputArb = fc
  .record({
    secrets: fc.array(secretContent, { minLength: 1, maxLength: 3 }),
    payloadParts: fc.array(
      fc.tuple(payloadFiller, fc.boolean(), fc.nat({ max: 20 })),
      { minLength: 0, maxLength: 4 },
    ),
    plainEvents: fc.array(lower, { maxLength: 3 }),
    notices: fc.array(lower, { maxLength: 4 }),
    extraDiag: fc.array(lower, { maxLength: 3 }),
    cap: fc.record({
      reason: fc.constantFrom('count', 'size'),
      byteLength: fc.nat({ max: 1 << 20 }),
      cap: fc.nat({ max: 1 << 20 }),
    }),
  })
  .map(({ secrets, payloadParts, plainEvents, notices, extraDiag, cap }) => {
    const payloads = new Map<string, Uint8Array>();
    const events: { kind: 'network-attempt'; destination: string; stepIndex: number; eventId?: string }[] = [];
    payloadParts.forEach(([filler, withSecret, cut], i) => {
      const id = `ev-${i}`;
      const text = withSecret ? `${filler}${secrets[0]!.slice(cut)}${filler}` : `${filler}${filler}PPPPPPPPPP`;
      payloads.set(id, enc.encode(text));
      events.push({ kind: 'network-attempt', destination: `h${i}.example`, stepIndex: 0, eventId: id });
    });
    plainEvents.forEach((d, i) =>
      events.push({ kind: 'network-attempt', destination: `${d}.p${i}.example`, stepIndex: 1 }),
    );
    const diagnostics: Diagnostic[] = [
      { name: SECRET_VALUES_CAPPED, path: '.env', detail: { ...cap } },
      ...extraDiag.map((n) => ({ name: n || 'x', path: `${n}.txt`, detail: { n: n.length } })),
    ];
    const captures = [...payloads].map(([eventId, bytes]) => ({
      eventId,
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }));
    const result: RunResult = {
      schemaVersion: 1,
      runId: 'run-1',
      status: 'ok',
      rehearsed: true,
      verdict: 'pass',
      report: {
        snapshots: [{ id: 's0', result: null, state: { rootPath: '/tmp/copy', entries: [] } }] as never,
        changes: [[]],
        effectsOutside: [[]],
        observedEvents: events,
        variantResults: [],
      },
      exitCodes: [0],
      copy: { cloned: true, location: '/tmp/copy' },
      isolation: {
        mode: 'docker-box',
        p1Claimed: true,
        p5Claimed: true,
        p6Claimed: true,
        readOnlyMounts: [],
      },
      recorder: { location: 'in-box', tamperResistant: false },
      captures,
      diagnostics,
      staticFindings: [],
      notices,
      phases: {
        dockerCheckMs: 0, fingerprintBeforeMs: 0, copyMs: 0, baselineMs: 0, boxOverheadMs: 0,
        execMs: 0, diffMs: 0, sqliteMs: 0, fingerprintAfterMs: 0, cleanupMs: 0,
      },
    };
    const output: RunOutput = { result, payloads };
    return { output, secrets };
  });

/** Forbidden needles: canary plus every 9-byte window of secret and payload content, in 4 encodings. */
function needles(contents: Uint8Array[]): string[] {
  const out = new Set<string>([CANARY]);
  const forms = (b: Uint8Array) => {
    out.add(dec.decode(b));
    out.add(Buffer.from(b).toString('base64').replace(/=+$/, ''));
    out.add(Buffer.from(b).toString('hex'));
    out.add([...b].map((x) => '%' + x.toString(16).padStart(2, '0')).join(''));
    out.add(encodeURIComponent(dec.decode(b)));
  };
  for (const c of contents) {
    forms(Uint8Array.from(Buffer.from(CANARY)));
    for (let i = 0; i + 9 <= c.length; i++) forms(c.subarray(i, i + 9));
  }
  return [...out].filter((n) => n.length > 0 && !/^[a-z0-9]{0,8}$/.test(n));
}

describe('Property 12: Serialized output never contains payload or secret bytes', () => {
  it(
    'no channel contains canary, payload, or secret windows (raw/base64/hex/URL); captures and eventIds are consistent',
    () => {
      fc.assert(
        fc.property(runOutputArb, ({ output, secrets }) => {
          executed++;
          const { result, payloads } = output;
          const contents = [...secrets.map((s) => enc.encode(s)), ...payloads.values()];
          const channels = [
            serializeRunResult(result),
            JSON.stringify(result.diagnostics),
            JSON.stringify(result.notices),
          ];
          const forbidden = needles(contents);
          for (const ch of channels) {
            const chUrl = ch;
            for (const n of forbidden) expect(chUrl.includes(n)).toBe(false);
          }

          // capped diagnostic carries only path, reason, lengths
          const capped = result.diagnostics.find((d) => d.name === SECRET_VALUES_CAPPED)!;
          expect(Object.keys(capped.detail!).sort()).toEqual(['byteLength', 'cap', 'reason']);

          const parsed = parseRunResult(serializeRunResult(result));
          // payload keys <-> exactly one event each
          const events = parsed.report.observedEvents;
          for (const key of payloads.keys()) {
            expect(events.filter((e) => e.eventId === key)).toHaveLength(1);
          }
          for (const e of events) {
            if (e.eventId === undefined) expect('eventId' in e).toBe(false);
            else expect(payloads.has(e.eventId)).toBe(true);
          }
          // captures serialized as exactly { eventId, byteLength, sha256 }
          expect(parsed.captures).toHaveLength(payloads.size);
          for (const c of parsed.captures) {
            expect(Object.keys(c).sort()).toEqual(['byteLength', 'eventId', 'sha256']);
            const bytes = payloads.get(c.eventId)!;
            expect(c.byteLength).toBe(bytes.byteLength);
            expect(c.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
          }
        }),
        pbtParams(false),
      );
      console.log(`Property 12 runs executed: ${executed} (mode=${PBT_MODE}, NUM_RUNS=${NUM_RUNS})`);
    },
    testTimeoutMs(false),
  );
});
