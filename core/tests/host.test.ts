// Feature: wards, Property 4: Host matching is spelling-invariant and exact
// **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 15.2**

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  compileAllowHosts,
  hostEntryKey,
  parseDestination,
} from '../src/judge/host.js';
import {
  entryText,
  IPV6_LOOPBACK,
  IPV6_MAPPED,
  oracleAllowsAny,
  renderGroups,
  sameGroups,
  type OracleEntry,
} from './fixtures/host-oracle.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

const SUFFIXES = ['example', 'test', 'localhost', 'invalid'] as const;
const label = fc.stringMatching(/^[a-z0-9]{1,8}$/);
const lowerHost = fc
  .tuple(fc.array(label, { minLength: 1, maxLength: 3 }), fc.constantFrom(...SUFFIXES))
  .map(([labels, suffix]) => [...labels, suffix].join('.'));
const port = fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined });

const entryArb: fc.Arbitrary<OracleEntry> = fc
  .tuple(fc.boolean(), lowerHost, port, label)
  .map(([wildcard, host, p, extra]) => {
    // A wildcard needs at least two labels after `*.`.
    const h = wildcard && !host.includes('.') ? extra + '.' + host : host;
    return p === undefined ? { wildcard, host: h } : { wildcard, host: h, port: p };
  });

interface Decoration {
  readonly upper: boolean;
  readonly dot: boolean;
  readonly scheme: string;
  readonly userinfo: string;
  readonly tail: string;
}
const decoration: fc.Arbitrary<Decoration> = fc.record({
  upper: fc.boolean(),
  dot: fc.boolean(),
  scheme: fc.constantFrom('', 'http://', 'HTTPS://', 'ftp://'),
  userinfo: fc.constantFrom('', 'user@', 'user:pw@', 'a@b@'),
  tail: fc.constantFrom('', '/', '/a/b', '?q=1', '#frag', '/p?q=1#f'),
});

function decorate(host: string, p: number | undefined, d: Decoration): string {
  const h = d.upper ? host.toUpperCase() : host;
  return (
    d.scheme + d.userinfo + h + (d.dot ? '.' : '') + (p === undefined ? '' : ':' + String(p)) + d.tail
  );
}

// Destination host: either derived from an entry (parent, one label, two labels) or free.
const destArb = (entries: readonly OracleEntry[]) =>
  fc.oneof(
    lowerHost,
    entries.length === 0
      ? lowerHost
      : fc
          .tuple(fc.constantFrom(...entries), fc.array(label, { maxLength: 2 }))
          .map(([e, extra]) => [...extra, e.host].join('.')),
  );

describe('Property 4: host matching', () => {
  it('matches the reference on undecorated (host, port) for every decoration', () => {
    fc.assert(
      fc.property(
        fc.array(entryArb, { minLength: 1, maxLength: 4 }),
        fc.nat(5),
        port,
        decoration,
        fc.nat(),
        (entries, _n, p, deco, pick) => {
          const e = entries[pick % entries.length] as OracleEntry;
          const hosts = [e.host, 'x.' + e.host, 'x.y.' + e.host, entries[0]!.host];
          for (const host of hosts) {
            const ref = parseDestination(decorate(host, p, deco));
            const actual = compileAllowHosts(entries.map(entryText)).allows(ref);
            expect(actual).toBe(oracleAllowsAny(entries, host, p));
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT ?? 0);

  it('random destinations agree with the reference', () => {
    fc.assert(
      fc.property(
        fc.array(entryArb, { maxLength: 4 }).chain((es) =>
          fc.tuple(fc.constant(es), destArb(es), port, decoration),
        ),
        ([entries, host, p, deco]) => {
          const actual = compileAllowHosts(entries.map(entryText)).allows(
            parseDestination(decorate(host, p, deco)),
          );
          expect(actual).toBe(oracleAllowsAny(entries, host, p));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT ?? 0);

  it('is monotonic: A subset of B (by hostEntryKey) and allows_A(d) implies allows_B(d)', () => {
    fc.assert(
      fc.property(
        fc.array(entryArb, { maxLength: 5 }).chain((b) =>
          fc.tuple(
            fc.constant(b),
            fc.array(fc.boolean(), { minLength: b.length, maxLength: b.length }),
            destArb(b),
            port,
            decoration,
          ),
        ),
        ([b, mask, host, p, deco]) => {
          const bTexts = b.map(entryText);
          const aTexts = bTexts.filter((_, i) => mask[i]);
          const bKeys = new Set(bTexts.map(hostEntryKey));
          expect(aTexts.every((t) => bKeys.has(hostEntryKey(t)))).toBe(true);
          const ref = parseDestination(decorate(host, p, deco));
          if (compileAllowHosts(aTexts).allows(ref)) {
            expect(compileAllowHosts(bTexts).allows(ref)).toBe(true);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT ?? 0);

  it('numeric-looking names are never allowed by an IPv4 entry', () => {
    const ipv4Entry = fc.constantFrom('192.0.2.10', '192.0.2.1', '192.0.2.254');
    const numeric = fc.oneof(
      fc.integer({ min: 0, max: 4294967295 }).map(String),
      fc.integer({ min: 0, max: 4294967295 }).map((n) => '0x' + n.toString(16)),
      fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 0xffffff })).map(
        ([a, b]) => '0x' + a.toString(16) + '.' + String(b),
      ),
      fc.constantFrom('3232235786', '3221226026', '0x7f.1', '0xc0.0.2.10', '192.0.2'),
    );
    fc.assert(
      fc.property(fc.array(ipv4Entry, { minLength: 1, maxLength: 3 }), numeric, port, decoration, (es, n, p, deco) => {
        const ref = parseDestination(decorate(n, p, { ...deco, upper: false }));
        expect(compileAllowHosts(es).allows(ref)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT ?? 0);

  it('IPv6 literals match only the same canonical address', () => {
    const addr = fc.constantFrom(IPV6_LOOPBACK, IPV6_MAPPED);
    const padding = fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 8 });
    fc.assert(
      fc.property(addr, addr, padding, fc.boolean(), port, (entryAddr, destAddr, pad, upper, p) => {
        const entry = '[' + renderGroups(entryAddr, [1], false) + ']';
        const dest =
          '[' + renderGroups(destAddr, pad, upper) + ']' + (p === undefined ? '' : ':' + String(p));
        const allowed = compileAllowHosts([entry]).allows(parseDestination(dest));
        expect(allowed).toBe(sameGroups(entryAddr, destAddr));
        const withPortEntry = compileAllowHosts([entry + ':443']).allows(parseDestination(dest));
        expect(withPortEntry).toBe(sameGroups(entryAddr, destAddr) && p === 443);
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT ?? 0);
});

describe('Property 4: examples', () => {
  const allows = (entries: string[], dest: string): boolean =>
    compileAllowHosts(entries).allows(parseDestination(dest));

  it('upper-case with a trailing dot equals the lower-case host', () => {
    expect(allows(['registry.npmjs.org'], 'Registry.NPMJS.org.')).toBe(true);
    expect(allows(['REGISTRY.npmjs.org.'], 'https://u:p@registry.npmjs.org/x?y#z')).toBe(true);
    expect(parseDestination('Registry.NPMJS.org.')).toEqual(parseDestination('registry.npmjs.org'));
  });

  it('a wildcard allows exactly one extra leftmost label', () => {
    expect(allows(['*.example.test'], 'a.example.test')).toBe(true);
    expect(allows(['*.example.test'], 'example.test')).toBe(false);
    expect(allows(['*.example.test'], 'a.b.example.test')).toBe(false);
  });

  it('numeric-looking names are not allowed by an IPv4 entry', () => {
    expect(allows(['192.0.2.10'], '192.0.2.10')).toBe(true);
    expect(allows(['192.0.2.10'], '3232235786')).toBe(false);
    expect(allows(['192.0.2.10'], '3221226026')).toBe(false);
    expect(allows(['192.0.2.10'], '0x7f.1')).toBe(false);
  });

  it('IPv6 literals match only the same address', () => {
    expect(allows(['[::1]'], '[0:0:0:0:0:0:0:1]')).toBe(true);
    expect(allows(['[::1]'], '[::ffff:c000:20a]')).toBe(false);
    expect(allows(['[::ffff:c000:20a]'], '[::ffff:192.0.2.10]')).toBe(true);
    expect(allows(['192.0.2.10'], '[::ffff:c000:20a]')).toBe(false);
  });

  it('hidden characters and unparsable destinations are never allowed', () => {
    expect(parseDestination('registry.npmjs\u200B.org')).toBeNull();
    expect(parseDestination(undefined)).toBeNull();
    expect(allows(['registry.npmjs.org'], 'registry.npmjs.org\u202E')).toBe(false);
    expect(allows(['registry.npmjs\u200B.org'], 'registry.npmjs.org')).toBe(false);
    expect(allows(['registry.npmjs.org'], 'a.example.test:99999')).toBe(false);
  });

  it('fails closed when URL is unavailable: name and IPv6 destinations parse to null', () => {
    const g = globalThis as { URL?: unknown };
    const saved = g.URL;
    try {
      delete g.URL;
      expect(parseDestination('registry.npmjs.org')).toBeNull();
      expect(parseDestination('https://a.example.test/x')).toBeNull();
      expect(parseDestination('[::1]')).toBeNull();
      expect(compileAllowHosts(['registry.npmjs.org']).allows(parseDestination('registry.npmjs.org'))).toBe(false);
    } finally {
      g.URL = saved;
    }
    expect(parseDestination('registry.npmjs.org')).not.toBeNull();
  });
});
