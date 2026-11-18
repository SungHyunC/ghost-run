import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runLine } from '../src/shell/interpret.js';
import { PAYLOAD_MAX } from '../src/shell/limits.js';
import { createRunTrace } from '../src/shell/run-trace.js';
import type { Entry } from '../src/state.js';
import { TraceBuilder } from '../src/trace.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { makeTestEnv } from './support/env.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

const enc = new TextEncoder();
const EVENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

const arbLabel = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,8}$/);
const arbHost = fc
  .tuple(arbLabel, fc.array(arbLabel, { maxLength: 2 }), fc.constantFrom('example', 'test', 'invalid', 'localhost'))
  .map(([first, mid, tld]) => [first, ...mid, tld].join('.'));
const arbScheme = fc.constantFrom('http', 'https', 'HTTP', 'Https');
const arbPort = fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined });
const arbSuffix = fc.constantFrom('', '/', '/p/q', '/p?x=1', '?x=1', '#f');

interface Target {
  readonly url: string;
  readonly destination: string;
}

const arbTarget: fc.Arbitrary<Target> = fc
  .tuple(arbScheme, arbHost, arbPort, arbSuffix)
  .map(([scheme, host, port, suffix]) => {
    const s = scheme.toLowerCase();
    const p = port ?? (s === 'https' ? 443 : 80);
    return {
      url: `${scheme}://${host}${port === undefined ? '' : `:${port}`}${suffix}`,
      destination: `${host.toLowerCase()}:${p}`,
    };
  });

/** Body: inline `-d` text, a file via `-d @` or `--data-binary @`, or none. */
type Body =
  | { kind: 'none' }
  | { kind: 'inline'; text: string }
  | { kind: 'file'; flag: '-d' | '--data-binary'; bytes: Uint8Array };

const arbBytes = fc.oneof(
  { weight: 4, arbitrary: fc.uint8Array({ maxLength: 300 }) },
  { weight: 1, arbitrary: fc.integer({ min: PAYLOAD_MAX - 2, max: PAYLOAD_MAX + 5000 }).map((n) => new Uint8Array(n).fill(0x41)) },
);

const arbBody: fc.Arbitrary<Body> = fc.oneof(
  fc.constant<Body>({ kind: 'none' }),
  fc
    .stringMatching(/^[ -&(-~]{0,200}$/)
    // A leading '@' makes curl read a file, so it is not an inline body.
    .filter((text) => !text.startsWith('@'))
    .map((text): Body => ({ kind: 'inline', text })),
  fc
    .tuple(fc.constantFrom<'-d' | '--data-binary'>('-d', '--data-binary'), arbBytes)
    .map(([flag, bytes]): Body => ({ kind: 'file', flag, bytes })),
);

const bodyBytes = (b: Body): Uint8Array | undefined =>
  b.kind === 'none' ? undefined : b.kind === 'inline' ? enc.encode(b.text) : b.bytes;

const bodyArgs = (b: Body, file: string): string =>
  b.kind === 'none' ? '' : b.kind === 'inline' ? `-d '${b.text}'` : `${b.flag} @${file}`;

function setup(bodies: Body[]) {
  const entries: Record<string, Entry> = { 'keep.txt': { kind: 'file', bytes: enc.encode('keep') } };
  bodies.forEach((b, i) => {
    if (b.kind === 'file') entries[`body${i}.bin`] = { kind: 'file', bytes: b.bytes };
  });
  const builder = new TraceBuilder();
  const { fs, env } = makeTestEnv(entries, { trace: createRunTrace(builder, 0, []) });
  return { fs, env, builder };
}

const snapshot = (fs: { walk(p: string): string[]; get(p: string): Entry | undefined }) =>
  fs
    .walk('')
    .sort()
    .map((p) => {
      const e = fs.get(p);
      return [p, e?.kind === 'file' ? Array.from(e.bytes).join(',') : e?.kind];
    });

describe('Property 14: Network attempts and payloads', () => {
  it(
    'one curl records one attempt to the lowercase host and port, exit 7, no file change, capped payload',
    async () => {
      // Feature: ghost-shell, Property 14: Network attempts and payloads
      // **Validates: Requirements 7.1, 7.2, 7.6, 7.7**
      await fc.assert(
        fc.asyncProperty(arbTarget, arbBody, fc.boolean(), async (target, body, silent) => {
          const { fs, env, builder } = setup([body]);
          const before = snapshot(fs);
          const line = `curl ${silent ? '-s ' : ''}${bodyArgs(body, 'body0.bin')} "${target.url}"`;
          const result = await runLine(line, env);
          expect(result.unsupportedReason).toBeUndefined();
          expect(result.exitCode).toBe(7);
          expect(snapshot(fs)).toEqual(before);
          const trace = builder.build();
          expect(trace.events).toHaveLength(1);
          const event = trace.events[0];
          expect(event?.kind).toBe('network-attempt');
          expect(event?.destination).toBe(target.destination);
          const bytes = bodyBytes(body);
          if (bytes === undefined) {
            expect(event?.eventId).toBeUndefined();
            expect(trace.payloads.size).toBe(0);
          } else {
            expect(event?.eventId).toMatch(EVENT_ID);
            const stored = trace.payloads.get(event?.eventId as string);
            expect(stored).toEqual(bytes.subarray(0, PAYLOAD_MAX));
            expect(stored?.byteLength).toBeLessThanOrEqual(PAYLOAD_MAX);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'a second request to the same destination in the same action appends its body to the same payload',
    async () => {
      // Feature: ghost-shell, Property 14: Network attempts and payloads
      // **Validates: Requirements 7.1, 7.2, 7.6, 7.7**
      await fc.assert(
        fc.asyncProperty(
          arbTarget,
          fc.constantFrom('', '/other', '?y=2'),
          fc.constantFrom('lower', 'upper'),
          arbBody,
          arbBody,
          async (target, suffix2, casing, b1, b2) => {
            const { fs, env, builder } = setup([b1, b2]);
            const before = snapshot(fs);
            // Same destination: rebuild the second URL with changed host case and path.
            const m = /^([A-Za-z]+:\/\/)([^/?#:]*)(.*)$/.exec(target.url) as RegExpExecArray;
            const host2 = casing === 'upper' ? (m[2] as string).toUpperCase() : (m[2] as string).toLowerCase();
            const rest = (m[3] as string).replace(/[/?#].*$/, '');
            const url2 = `${m[1] as string}${host2}${rest}${suffix2}`;
            const line = `curl ${bodyArgs(b1, 'body0.bin')} "${target.url}"; curl ${bodyArgs(b2, 'body1.bin')} "${url2}"`;
            const result = await runLine(line, env);
            expect(result.exitCode).toBe(7);
            expect(snapshot(fs)).toEqual(before);
            const trace = builder.build();
            expect(trace.events).toHaveLength(1);
            expect(trace.events[0]?.destination).toBe(target.destination);
            const parts = [bodyBytes(b1), bodyBytes(b2)].filter((x): x is Uint8Array => x !== undefined);
            if (parts.length === 0) {
              expect(trace.payloads.size).toBe(0);
              return;
            }
            const joined = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
            let at = 0;
            for (const p of parts) {
              joined.set(p, at);
              at += p.byteLength;
            }
            const id = trace.events[0]?.eventId as string;
            expect(id).toMatch(EVENT_ID);
            expect(trace.payloads.size).toBe(1);
            expect(trace.payloads.get(id)).toEqual(joined.subarray(0, PAYLOAD_MAX));
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'a missing -d @file exits 26 and records neither event nor payload',
    async () => {
      // Feature: ghost-shell, Property 14: Network attempts and payloads
      // **Validates: Requirements 7.1, 7.2, 7.6, 7.7**
      await fc.assert(
        fc.asyncProperty(
          arbTarget,
          fc.constantFrom('-d', '--data-binary'),
          fc.stringMatching(/^[a-z]{1,8}\.(txt|bin)$/),
          async (target, flag, name) => {
            const { fs, env, builder } = setup([]);
            const before = snapshot(fs);
            const result = await runLine(`curl ${flag} @${name} "${target.url}"`, env);
            expect(result.exitCode).toBe(26);
            expect(result.unsupportedReason).toBeUndefined();
            expect(snapshot(fs)).toEqual(before);
            const trace = builder.build();
            expect(trace.events).toEqual([]);
            expect(trace.payloads.size).toBe(0);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'a URL that is not http or https with a host is unsupported and records nothing',
    async () => {
      // Feature: ghost-shell, Property 14: Network attempts and payloads
      // **Validates: Requirements 7.1, 7.2, 7.6, 7.7**
      const arbBad = fc.oneof(
        fc
          .tuple(fc.constantFrom('ftp', 'file', 'ssh', 'ws', 'gopher'), arbHost)
          .map(([s, h]) => `${s}://${h}`),
        fc.constantFrom('http:///p', 'https://', 'http://:80', 'https://:443/x', 'http://h.example:0', 'http://h.example:70000', 'http://h.example:x'),
        arbHost,
      );
      await fc.assert(
        fc.asyncProperty(arbBad, async (url) => {
          const { env, builder } = setup([]);
          const result = await runLine(`curl "${url}"`, env);
          expect(result.exitCode).toBe(127);
          expect(result.unsupportedReason).toBeDefined();
          expect(builder.build().events).toEqual([]);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: two bodies to HTTPS://A.example and https://a.EXAMPLE:443 share one payload', async () => {
    const { env, builder } = setup([]);
    await runLine(`curl -d 'ab' "HTTPS://A.example"; curl -d 'cd' "https://a.EXAMPLE:443/x"`, env);
    const trace = builder.build();
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]?.destination).toBe('a.example:443');
    expect(new TextDecoder().decode(trace.payloads.get(trace.events[0]?.eventId as string))).toBe('abcd');
  });
});
