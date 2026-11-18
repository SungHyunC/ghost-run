import fc from 'fast-check';
import { expect, it } from 'vitest';
import { WardEngine } from '../src/wards.js';
import type { GhostReport, ObservedEvent, Ward, WardViolation } from '../src/types.js';
import { describeClaimed } from './fixtures/claim-scope.js';
import { utf8 } from './fixtures/encoders.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

const ward: Ward = {
  id: 'no-exfil',
  kind: 'egress',
  secrets: ['.env'],
  allow_hosts: ['registry.npmjs.org', '*.example.test'],
};

function report(events: readonly ObservedEvent[]): GhostReport<unknown> {
  return {
    snapshots: [],
    observedEvents: events,
    changes: [],
    effectsOutside: [],
    variantResults: [],
  };
}

const isBehavior = (v: WardViolation): boolean =>
  v.reason.startsWith('network attempt to ') || / more network attempts not listed$/.test(v.reason);

const CAP = 20;
const stepArb = fc.integer({ min: 0, max: 6 });

// Hosts outside the allow list (reserved names and 192.0.2.x only), plus allowed ones.
const outsideHostArb = fc.oneof(
  fc.integer({ min: 0, max: 99 }).map((n) => `h${String(n).padStart(2, '0')}.example`),
  fc.integer({ min: 0, max: 30 }).map((n) => `x${n}.invalid`),
  fc.integer({ min: 1, max: 254 }).map((n) => `192.0.2.${n}`),
  fc.constantFrom('example.test', 'a.b.example.test', 'registry.npmjs.org.invalid'),
);
const allowedHostArb = fc.constantFrom('registry.npmjs.org', 'a.example.test', 'REGISTRY.NPMJS.ORG');

const schemeArb = fc.constantFrom('', 'https://', 'http://', 'tcp://', 'HTTPS://');
const portArb = fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined });
const tailArb = fc.constantFrom('', '/', '/a/b?q=1', '#frag', '/x?y#z');
const userArb = fc.constantFrom('', 'user@', 'u:p@');

interface Attempt {
  readonly step: number;
  readonly host: string;
  readonly port: number | undefined;
  readonly scheme: string;
  readonly user: string;
  readonly tail: string;
}

const attemptArb = (hostArb: fc.Arbitrary<string>): fc.Arbitrary<Attempt> =>
  fc.record({
    step: stepArb,
    host: hostArb,
    port: portArb,
    scheme: schemeArb,
    user: userArb,
    tail: tailArb,
  });

const destination = (a: Attempt): string =>
  `${a.scheme}${a.user}${a.host}${a.port === undefined ? '' : ':' + a.port}${a.tail}`;
const redacted = (a: Attempt): string =>
  `${a.host.toLowerCase()}${a.port === undefined ? '' : ':' + a.port}`;

const matchingReadPathArb = fc.constantFrom('.env', '.ENV', './.env');
const otherReadPathArb = fc.constantFrom('README.md', 'src/env.txt', '.env.example');

const readsArb = fc.array(
  fc.record({ step: stepArb, path: fc.oneof(matchingReadPathArb, otherReadPathArb) }),
  { maxLength: 4 },
);

const isMatchingRead = (p: string): boolean => ['.env', '.ENV', './.env'].includes(p);

function toEvents(
  reads: readonly { step: number; path: string }[],
  outside: readonly Attempt[],
  allowed: readonly Attempt[],
): ObservedEvent[] {
  return [
    ...reads.map((r): ObservedEvent => ({ kind: 'secret-read', path: r.path, stepIndex: r.step })),
    ...outside.map((a): ObservedEvent => ({ kind: 'network-attempt', destination: destination(a), stepIndex: a.step })),
    ...allowed.map((a): ObservedEvent => ({ kind: 'network-attempt', destination: destination(a), stepIndex: a.step })),
  ];
}

describeClaimed('P6', () => {
  // Feature: wards, Property 8: Secret read then unapproved network attempt blocks (P6, action criterion)
  // **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 11.6, 11.7, 19.5**
  it(
    'blocks exactly the attempts at or after the first matching secret read, sorted and capped at 20',
    () => {
      fc.assert(
        fc.property(
          readsArb,
          fc.array(attemptArb(outsideHostArb), { maxLength: 45 }),
          fc.array(attemptArb(allowedHostArb), { maxLength: 5 }),
          (reads, outside, allowed) => {
            const v = WardEngine.evaluate(report(toEvents(reads, outside, allowed)), { wards: [ward] });
            const matching = reads.filter((r) => isMatchingRead(r.path)).map((r) => r.step);
            const behavior = v.violations.filter(isBehavior);
            if (matching.length === 0) {
              expect(behavior).toEqual([]);
              expect(v.violations).toEqual([]);
              return;
            }
            const first = Math.min(...matching);
            const expected = outside
              .filter((a) => a.step >= first)
              .map((a) => ({ step: a.step, dest: redacted(a) }))
              .sort((x, y) => x.step - y.step || (x.dest < y.dest ? -1 : x.dest > y.dest ? 1 : 0));
            if (expected.length === 0) {
              expect(behavior).toEqual([]);
              expect(v.verdict).not.toBe('block');
              return;
            }
            expect(v.verdict).toBe('block');
            const listed = expected.slice(0, CAP).map(
              (e) =>
                `network attempt to ${e.dest} at step ${e.step} after secret read at step ${first}; host not in allow_hosts`,
            );
            if (expected.length > CAP) listed.push(`${expected.length - CAP} more network attempts not listed`);
            expect(behavior.map((x) => x.reason)).toEqual(listed);
            for (const x of behavior) {
              expect(x.wardId).toBe('no-exfil');
              expect(x.wardKind).toBe('egress');
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: wards, Property 8: Secret read then unapproved network attempt blocks (P6, action criterion)
  // **Validates: Requirements 8.1, 8.2, 8.3**
  it(
    'blocks when the attempt is in the same step as the read (j == i) and ignores j < i',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: -3, max: 3 }),
          attemptArb(outsideHostArb),
          matchingReadPathArb,
          (i, delta, a, path) => {
            fc.pre(i + delta >= 0);
            const j = i + delta;
            const events = toEvents([{ step: i, path }], [{ ...a, step: j }], []);
            const v = WardEngine.evaluate(report(events), { wards: [ward] });
            if (j >= i) {
              expect(v.verdict).toBe('block');
              expect(v.violations.filter(isBehavior)).toHaveLength(1);
            } else {
              expect(v.violations).toEqual([]);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it('blocks an attempt in the same step as the secret read (fixed example)', () => {
    const v = WardEngine.evaluate(
      report([
        { kind: 'secret-read', path: '.env', stepIndex: 3 },
        { kind: 'network-attempt', destination: 'https://setup-check.example:8443/x', stepIndex: 3 },
      ]),
      { wards: [ward] },
    );
    expect(v.verdict).toBe('block');
    expect(v.violations.map((x) => x.reason)).toEqual([
      'network attempt to setup-check.example:8443 at step 3 after secret read at step 3; host not in allow_hosts',
    ]);
  });

  it('lists 20 attempts then one "<k> more" entry (fixed example)', () => {
    const events: ObservedEvent[] = [{ kind: 'secret-read', path: '.env', stepIndex: 0 }];
    for (let n = 0; n < 27; n++) {
      events.push({ kind: 'network-attempt', destination: `h${String(n).padStart(2, '0')}.example`, stepIndex: 1 });
    }
    const v = WardEngine.evaluate(report(events), { wards: [ward] });
    expect(v.violations).toHaveLength(21);
    expect(v.violations[20]?.reason).toBe('7 more network attempts not listed');
  });

  // Content inspection setup: the secret file holds a canary value.
  const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
  const canaryArb = fc
    .array(fc.constantFrom(...ALNUM), { minLength: 12, maxLength: 24 })
    .map((cs) => 'sk-CANARY-' + cs.join(''));
  const secretText = (canary: string): string => `API_KEY=${canary}\n`;

  const secretEvents = (id: string): ObservedEvent[] => [
    { kind: 'secret-read', path: '.env', stepIndex: 0 },
    { kind: 'network-attempt', destination: 'drop.example:9000', stepIndex: 1, eventId: id },
  ];

  const inputsFor = (canary: string, payload: Uint8Array) => ({
    secretValues: new Map([['.env', utf8(secretText(canary))]]),
    payloads: new Map([['e1', payload]]),
  });

  /** Independent oracle: does the payload share any 8-gram with the secret file text (raw view)? */
  function sharesGram(payload: Uint8Array, canary: string): boolean {
    let p = '';
    for (const b of payload) p += String.fromCharCode(b);
    const views = [p, p.replace(/[\r\n \t]/g, '')].map((s) => s.toLowerCase());
    const f = secretText(canary).toLowerCase();
    for (let i = 0; i + 8 <= f.length; i++) {
      if (views.some((s) => s.includes(f.slice(i, i + 8)))) return true;
    }
    return false;
  }

  const reverse = (b: Uint8Array): Uint8Array => Uint8Array.from(b).reverse();
  const xor = (b: Uint8Array, key: number): Uint8Array => b.map((x) => x ^ key);
  const concat = (...parts: Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of parts) {
      out.set(x, o);
      o += x.length;
    }
    return out;
  };

  const transformArb = (canary: string): fc.Arbitrary<Uint8Array> => {
    const raw = utf8(canary);
    return fc.oneof(
      // gzip-like: magic header, then compressed-looking (key-masked) body
      fc
        .tuple(fc.integer({ min: 1, max: 255 }), fc.uint8Array({ minLength: 4, maxLength: 8 }))
        .map(([key, tail]) => concat(Uint8Array.of(0x1f, 0x8b, 0x08, 0x00), tail, xor(raw, key))),
      fc.integer({ min: 1, max: 255 }).map((key) => xor(raw, key)),
      fc.constant(reverse(raw)),
      // split: chunks shorter than 8 bytes joined by a separator
      fc
        .tuple(fc.integer({ min: 1, max: 7 }), fc.constantFrom('|', '~', '#', ';'))
        .map(([size, sep]) => {
          const chunks: string[] = [];
          for (let i = 0; i < canary.length; i += size) chunks.push(canary.slice(i, i + size));
          return utf8(chunks.join(sep));
        }),
    );
  };

  // Feature: wards, Property 8: Secret read then unapproved network attempt blocks (P6, action criterion)
  // **Validates: Requirements 8.4, 8.5, 19.5**
  it(
    'blocks a transformed payload (gzip-like, XOR, reversed, split) without any content violation',
    () => {
      let checked = 0;
      fc.assert(
        fc.property(
          canaryArb.chain((c) => fc.tuple(fc.constant(c), transformArb(c))),
          ([canary, payload]) => {
            fc.pre(!sharesGram(payload, canary));
            checked++;
            const v = WardEngine.evaluate(report(secretEvents('e1')), { wards: [ward] }, inputsFor(canary, payload));
            expect(v.verdict).toBe('block');
            expect(v.violations.map((x) => x.reason)).toEqual([
              'network attempt to drop.example:9000 at step 1 after secret read at step 0; host not in allow_hosts',
            ]);
          },
        ),
        { numRuns: NUM_RUNS },
      );
      expect(checked).toBeGreaterThan(0);
    },
    PBT_TIMEOUT ?? 0,
  );

  // Feature: wards, Property 8: Secret read then unapproved network attempt blocks (P6, action criterion)
  // **Validates: Requirements 8.6, 8.7, 11.6, 11.7**
  it(
    'lists behavior violations before content violations of the same ward',
    () => {
      fc.assert(
        fc.property(canaryArb, fc.integer({ min: 1, max: 25 }), (canary, extra) => {
          const events = secretEvents('e1');
          for (let n = 0; n < extra; n++) {
            events.push({ kind: 'network-attempt', destination: `h${String(n).padStart(2, '0')}.example`, stepIndex: 2 });
          }
          const v = WardEngine.evaluate(report(events), { wards: [ward] }, inputsFor(canary, utf8('x=' + canary)));
          expect(v.verdict).toBe('block');
          const kinds = v.violations.map((x) => (isBehavior(x) ? 'b' : 'c')).join('');
          expect(kinds).toMatch(/^b+c+$/);
          expect(v.violations.filter((x) => !isBehavior(x)).length).toBeGreaterThan(0);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );
});
