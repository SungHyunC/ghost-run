import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WardEngine } from '../src/wards.js';
import type { GhostReport, ObservedEvent, Ward } from '../src/types.js';
import { PAYLOAD_CAP, createInspector, detectKinds } from '../src/judge/inspect.js';
import type { EncodingKind } from '../src/judge/inspect.js';
import { base64, base64url, breakLines, hex, percentAll, utf8 } from './fixtures/encoders.js';
import { describeClaimed } from './fixtures/claim-scope.js';
import { NUM_RUNS, PBT_TIMEOUT, makeYielder } from './pbt-config.js';

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const alnumChar = fc.constantFrom(...ALNUM.split(''));

// Canary values only: fake `sk-CANARY-` plus generated alphanumerics (>= 8 bytes overall).
const canaryArb = fc
  .array(alnumChar, { minLength: 6, maxLength: 24 })
  .map((cs) => 'sk-CANARY-' + cs.join(''));

/** Every encoded form of a canary (all layers the inspector supports, plus line-broken). */
function allForms(canary: string): string[] {
  const forms = [canary];
  for (let offset = 0; offset < 3; offset++) {
    const bytes = new Uint8Array(offset + canary.length);
    bytes.set(utf8(canary), offset);
    for (const padded of [true, false]) {
      forms.push(base64(bytes, padded), base64url(bytes, padded));
    }
  }
  const raw = utf8(canary);
  for (const c of ['lower', 'upper', 'mixed'] as const) forms.push(hex(raw, c));
  forms.push(percentAll(raw));
  return forms;
}

/** Independent check: does the payload (in any decoded view) share any 8-gram with any encoded form? */
function sharesGram(payload: string, canaries: readonly string[]): boolean {
  const strip = (s: string): string => s.replace(/[\r\n \t]/g, '');
  const pct = (s: string): string =>
    s.replace(/%([0-9a-fA-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\+/g, ' ');
  const views = [payload, strip(payload), pct(payload), strip(pct(payload))].map((v) => v.toLowerCase());
  for (const canary of canaries) {
    for (const form of allForms(canary)) {
      const f = form.toLowerCase();
      for (let i = 0; i + 8 <= f.length; i++) {
        const gram = f.slice(i, i + 8);
        if (views.some((v) => v.includes(gram))) return true;
      }
    }
  }
  return false;
}

function bytesToString(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i] as number);
  return s;
}

describeClaimed('P6', () => {
  describe('Property 10: no false positives and a hard 64 KiB cap', () => {
    const noiseArb = fc.oneof(
      fc.array(alnumChar, { maxLength: 60 }).map((a) => a.join('')),
      fc.constantFrom('%', '%41', '+', '=', '-', '_', '/', ' ', '\r\n', '\t', '.'),
      fc.string({ maxLength: 20 }),
    );

    // Feature: wards, Property 10: No false positives and a hard 64 KiB cap
    // **Validates: Requirements 9.6, 10.9, 19.6**
    it(
      'reports no hit when an independent check finds no encoded form of any canary',
      () => {
        let checked = 0;
        fc.assert(
          fc.property(
            fc.uniqueArray(canaryArb, { minLength: 1, maxLength: 3 }),
            fc.array(
              fc.oneof(
                noiseArb,
                // Fragments shorter than the 8-byte window never count as a hit.
                canaryArb.chain((c) => fc.integer({ min: 1, max: 7 }).map((n) => c.slice(0, n))),
                canaryArb.map((c) => c.slice(-7)),
              ),
              { maxLength: 30 },
            ),
            (canaries, pieces) => {
              const text = pieces.join('');
              fc.pre(!sharesGram(text, canaries));
              checked++;
              const payload = utf8(text);
              const cb = canaries.map(utf8);
              expect(detectKinds(payload, cb)).toEqual([]);
              expect(createInspector(new Map([['e1', payload]])).hits(cb).size).toBe(0);
            },
          ),
          { numRuns: NUM_RUNS },
        );
        expect(checked).toBeGreaterThan(0);
      },
      PBT_TIMEOUT ?? 0,
    );

    // Feature: wards, Property 10: No false positives and a hard 64 KiB cap
    // **Validates: Requirements 9.6, 10.9, 19.6**
    it(
      'searches only the first 65,536 bytes of a longer payload',
      async () => {
        const tick = makeYielder();
        const layerArb = fc.constantFrom<{ kind: EncodingKind; enc: (c: string) => string }>(
          { kind: 'raw', enc: (c) => c },
          { kind: 'base64', enc: (c) => base64(utf8(c), true) },
          { kind: 'base64', enc: (c) => breakLines(base64(utf8(c), false), 76) },
          { kind: 'base64url', enc: (c) => base64url(utf8('xx' + c), false).slice(3) },
          { kind: 'hex', enc: (c) => hex(utf8(c), 'upper') },
          { kind: 'hex', enc: (c) => hex(utf8(c), 'mixed') },
          { kind: 'percent', enc: (c) => percentAll(utf8(c)) },
        );
        await fc.assert(
          fc.asyncProperty(
            canaryArb,
            layerArb,
            fc.integer({ min: 0, max: 40 }),
            fc.integer({ min: 0, max: 5000 }),
            async (canary, layer, slack, extra) => {
              await tick();
              const form = layer.enc(canary);
              const L = form.length;
              const cb = [utf8(canary)];
              const filler = (n: number): string => '.'.repeat(n);

              // Form ends at or before byte 65,536: detected.
              const startIn = PAYLOAD_CAP - L - slack;
              const inside = utf8(filler(startIn) + form + filler(extra + slack + 1));
              expect(inside.length).toBeGreaterThan(PAYLOAD_CAP);
              const kinds = detectKinds(inside, cb);
              expect(kinds).toContain(layer.kind);
              expect(createInspector(new Map([['e', inside]])).hits(cb).has('e')).toBe(true);

              // Form starts at or after byte 65,536: not detected.
              const outside = utf8(filler(PAYLOAD_CAP + slack) + form + filler(extra));
              expect(detectKinds(outside, cb)).toEqual([]);
              expect(createInspector(new Map([['e', outside]])).hits(cb).size).toBe(0);
            },
          ),
          { numRuns: NUM_RUNS },
        );
      },
      PBT_TIMEOUT ?? 0,
    );

    it('regression: a form straddling byte 65,536 is not reported when truncated mid-form', () => {
      const canary = 'sk-CANARY-abcdef123456';
      const payload = utf8('.'.repeat(PAYLOAD_CAP - 4) + canary + '.'.repeat(10));
      expect(bytesToString(payload.subarray(PAYLOAD_CAP - 4, PAYLOAD_CAP))).toBe('sk-C');
      expect(detectKinds(payload, [utf8(canary)])).toEqual([]);
    });
  });

  describe('Property 9: content inspection detects every supported encoding at every offset', () => {
    interface Form {
      readonly text: string;
      readonly kind: EncodingKind;
    }

    const ENCODING_ORDER_REF: readonly EncodingKind[] = ['raw', 'base64', 'base64url', 'hex', 'percent'];

    // 0 to 64 arbitrary bytes. 0x25 ('%') is excluded from prefixes: a trailing '%' would legitimately
    // combine with the first characters of the form when the payload is percent-decoded.
    const prefixArb = fc.array(
      fc.integer({ min: 0, max: 255 }).filter((b) => b !== 0x25),
      { maxLength: 64 },
    );
    const suffixArb = fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 64 });
    const offsetBytesArb = (o: number): fc.Arbitrary<number[]> =>
      fc.array(fc.integer({ min: 0, max: 255 }), { minLength: o, maxLength: o });

    // `sk-CANARY-` plus 0 or more alphanumerics (at least 8 bytes in total).
    const plainCanaryArb = fc.array(alnumChar, { maxLength: 40 }).map((cs) => 'sk-CANARY-' + cs.join(''));

    const concat = (a: readonly number[], b: Uint8Array): Uint8Array => {
      const out = new Uint8Array(a.length + b.length);
      out.set(a, 0);
      out.set(b, a.length);
      return out;
    };

    const assemble = (prefix: readonly number[], form: string, suffix: readonly number[]): Uint8Array =>
      concat([...prefix, ...utf8(form)], Uint8Array.from(suffix));

    // -- encoding families (independent encoders from fixtures/encoders.ts) ------------------------------

    const rawFormArb = (c: string): fc.Arbitrary<Form> => fc.constant({ text: c, kind: 'raw' });

    const hexFormArb = (c: string): fc.Arbitrary<Form> =>
      fc
        .constantFrom<'lower' | 'upper' | 'mixed'>('lower', 'upper', 'mixed')
        .map((hc) => ({ text: hex(utf8(c), hc), kind: 'hex' }));

    const base64FormArb = (c: string): fc.Arbitrary<Form> =>
      fc
        .tuple(fc.constantFrom(0, 1, 2), fc.boolean(), fc.boolean())
        .chain(([o, padded, url]) =>
          offsetBytesArb(o).map((off): Form => {
            const bytes = concat(off, utf8(c));
            return url
              ? { text: base64url(bytes, padded), kind: 'base64url' }
              : { text: base64(bytes, padded), kind: 'base64' };
          }),
        );

    const brokenFormArb = (c: string): fc.Arbitrary<Form> =>
      fc
        .tuple(
          fc.constantFrom(0, 1, 2),
          fc.boolean(),
          fc.constantFrom(76, 60),
          fc.constantFrom<'b64' | 'hex' | 'crlf-hex'>('b64', 'hex', 'crlf-hex'),
        )
        .chain(([o, padded, width, family]) =>
          offsetBytesArb(o).map((off): Form => {
            if (family === 'b64') {
              return { text: breakLines(base64(concat(off, utf8(c)), padded), width), kind: 'base64' };
            }
            const h = hex(utf8(c), 'lower');
            if (family === 'hex') return { text: breakLines(h, width), kind: 'hex' };
            // CR LF inserted after every second byte pair.
            return { text: h.replace(/(.{4})/g, '$1\r\n'), kind: 'hex' };
          }),
        );

    const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
    const percentByte = (code: number, lower: boolean): string => {
      const h = code.toString(16).padStart(2, '0');
      return '%' + (lower ? h : h.toUpperCase());
    };

    /** %XX in either case, '+' or %20 for a space, unreserved characters literal or encoded at random. */
    const percentFormArb = (c: string): fc.Arbitrary<Form> =>
      fc
        .array(fc.tuple(fc.boolean(), fc.boolean()), { minLength: c.length, maxLength: c.length })
        .map((choices): Form => {
          let text = '';
          for (let i = 0; i < c.length; i++) {
            const ch = c.charAt(i);
            const [encode, flag] = choices[i] as [boolean, boolean];
            if (ch === ' ') text += flag ? '+' : '%20';
            else if (UNRESERVED.test(ch) && !encode) text += ch;
            else text += percentByte(ch.charCodeAt(0), flag);
          }
          return { text, kind: /[%+]/.test(text) ? 'percent' : 'raw' };
        });

    /** Base64 text with '+', '/' and '=' percent-encoded. */
    const base64PercentFormArb = (c: string): fc.Arbitrary<Form> =>
      fc
        .tuple(fc.constantFrom(0, 1, 2), fc.boolean(), fc.boolean())
        .chain(([o, padded, lowerHex]) =>
          offsetBytesArb(o).map((off): Form => {
            const text = base64(concat(off, utf8(c)), padded).replace(/[+/=]/g, (m) =>
              percentByte(m.charCodeAt(0), lowerHex),
            );
            return { text, kind: 'base64' };
          }),
        );

    const anyFormArb = (c: string): fc.Arbitrary<Form> =>
      fc.oneof(
        rawFormArb(c),
        hexFormArb(c),
        base64FormArb(c),
        brokenFormArb(c),
        percentFormArb(c),
        base64PercentFormArb(c),
      );

    function checkInspector(
      family: (c: string) => fc.Arbitrary<Form>,
      canaries: fc.Arbitrary<string> = plainCanaryArb,
    ): void {
      fc.assert(
        fc.property(
          canaries.chain((c) => fc.tuple(fc.constant(c), family(c))),
          prefixArb,
          suffixArb,
          ([canary, form], prefix, suffix) => {
            const payload = assemble(prefix, form.text, suffix);
            const cb = [utf8(canary)];
            const kinds = detectKinds(payload, cb);
            expect(kinds).toContain(form.kind);
            // Kinds come out in the fixed order, each at most once.
            expect(kinds).toEqual(ENCODING_ORDER_REF.filter((k) => kinds.includes(k)));
            expect(createInspector(new Map([['e', payload]])).hits(cb).get('e')).toContain(form.kind);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    }

    // Feature: wards, Property 9: Content inspection detects every supported encoding at every offset (P6, content criterion)
    // **Validates: Requirements 9.3, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.3, 11.4, 19.6, 19.7**
    it(
      'detects the raw canary and lower-, upper- and mixed-case hex',
      () => {
        checkInspector((c) => fc.oneof(rawFormArb(c), hexFormArb(c)));
      },
      PBT_TIMEOUT ?? 0,
    );

    // Feature: wards, Property 9: Content inspection detects every supported encoding at every offset (P6, content criterion)
    // **Validates: Requirements 9.3, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.3, 11.4, 19.6, 19.7**
    it(
      'detects base64 and base64url, padded and unpadded, at byte offsets 0, 1 and 2 of a 3-byte group',
      () => {
        checkInspector(base64FormArb);
      },
      PBT_TIMEOUT ?? 0,
    );

    // Feature: wards, Property 9: Content inspection detects every supported encoding at every offset (P6, content criterion)
    // **Validates: Requirements 9.3, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.3, 11.4, 19.6, 19.7**
    it(
      'detects percent-encoding (either hex case, + or %20 for a space) and percent-encoded base64',
      () => {
        const spacedCanaryArb = fc
          .array(fc.array(alnumChar, { maxLength: 10 }).map((a) => a.join('')), { minLength: 1, maxLength: 3 })
          .map((parts) => 'sk-CANARY-' + parts.join(' '));
        checkInspector(percentFormArb, fc.oneof(plainCanaryArb, spacedCanaryArb));
        checkInspector(base64PercentFormArb);
      },
      PBT_TIMEOUT ?? 0,
    );

    // Feature: wards, Property 9: Content inspection detects every supported encoding at every offset (P6, content criterion)
    // **Validates: Requirements 9.3, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.3, 11.4, 19.6, 19.7**
    it(
      'detects base64 and hex text broken into lines of 76 or 60 characters or with CR LF inserted',
      () => {
        checkInspector(brokenFormArb);
      },
      PBT_TIMEOUT ?? 0,
    );

    // Feature: wards, Property 9: Content inspection detects every supported encoding at every offset (P6, content criterion)
    // **Validates: Requirements 9.3, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.3, 11.4, 19.6, 19.7**
    it(
      'decision D6: a multi-line canary is found as raw when the payload has the whitespace removed or changed',
      () => {
        const multiLineArb = fc
          .array(plainCanaryArb, { minLength: 2, maxLength: 3 })
          .chain((lines) =>
            fc.tuple(
              fc.constantFrom('\n', '\r\n'),
              fc.constantFrom('', ' ', '\t', '\n', '\r\n', '\n\n'),
              fc.constant(lines),
            ),
          );
        fc.assert(
          fc.property(multiLineArb, prefixArb, suffixArb, ([eol, glue, lines], prefix, suffix) => {
            const canary = lines.join(eol);
            const payload = assemble(prefix, lines.join(glue), suffix);
            const cb = [utf8(canary)];
            expect(detectKinds(payload, cb)).toContain('raw');
            expect(createInspector(new Map([['e', payload]])).hits(cb).get('e')).toContain('raw');
          }),
          { numRuns: NUM_RUNS },
        );
      },
      PBT_TIMEOUT ?? 0,
    );

    // -- evaluate: payloads to an allowed host still block -------------------------------------------------

    const egressWard: Ward = {
      id: 'no-exfil',
      kind: 'egress',
      secrets: ['.env', 'secrets/**'],
      allow_hosts: ['registry.npmjs.org', '*.example.test'],
    };

    function evaluateWith(
      secretPath: string,
      readPath: string,
      secretBytes: Uint8Array,
      payload: Uint8Array,
      host: string,
      withSecretRead: boolean,
      readStep: number,
      sendStep: number,
    ): ReturnType<typeof WardEngine.evaluate> {
      const events: ObservedEvent[] = [
        ...(withSecretRead
          ? [{ kind: 'secret-read', path: readPath, stepIndex: readStep } as ObservedEvent]
          : []),
        { kind: 'network-attempt', destination: `https://${host}/upload`, stepIndex: sendStep, eventId: 'e1' },
      ];
      const report: GhostReport<unknown> = {
        snapshots: [],
        observedEvents: events,
        changes: [],
        effectsOutside: [],
        variantResults: [],
      };
      return WardEngine.evaluate(
        report,
        { wards: [egressWard] },
        { secretValues: new Map([[secretPath, secretBytes]]), payloads: new Map([['e1', payload]]) },
      );
    }

    function expectContentBlock(
      v: ReturnType<typeof WardEngine.evaluate>,
      secretPath: string,
      expected: EncodingKind,
      canary: string,
    ): void {
      expect(v.verdict).toBe('block');
      const prefix = `payload of event e1 contains a value from secret file ${secretPath} (encoding: `;
      const hit = v.violations.find((x) => x.reason.startsWith(prefix));
      expect(hit).toBeDefined();
      const listed = (hit as { reason: string }).reason.slice(prefix.length, -1).split(', ') as EncodingKind[];
      expect(listed).toContain(expected);
      expect(listed).toEqual(ENCODING_ORDER_REF.filter((k) => listed.includes(k)));
      expect(hit?.wardId).toBe('no-exfil');
      // The verdict never carries the canary itself.
      expect(JSON.stringify(v)).not.toContain(canary);
    }

    // Feature: wards, Property 9: Content inspection detects every supported encoding at every offset (P6, content criterion)
    // **Validates: Requirements 9.3, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.3, 11.4, 19.6, 19.7**
    it(
      'evaluate blocks an encoded canary sent to an allowed host, with and without a secret-read',
      () => {
        const allowedArb = fc.constantFrom('registry.npmjs.org', 'a.example.test', 'REGISTRY.NPMJS.ORG');
        fc.assert(
          fc.property(
            plainCanaryArb.chain((c) => fc.tuple(fc.constant(c), anyFormArb(c))),
            prefixArb,
            suffixArb,
            allowedArb,
            fc.boolean(),
            fc.constantFrom('.env', '.ENV', './.env'),
            fc.integer({ min: 0, max: 5 }),
            fc.integer({ min: 0, max: 5 }),
            ([canary, form], prefix, suffix, host, withRead, readPath, readStep, sendStep) => {
              const envFile = utf8(`# config\nAPI_KEY=${canary}\nMODE=dev\n`);
              const v = evaluateWith(
                '.env',
                readPath,
                envFile,
                assemble(prefix, form.text, suffix),
                host,
                withRead,
                readStep,
                sendStep,
              );
              expectContentBlock(v, '.env', form.kind, canary);
              // Content hits ignore allow_hosts: no behavior violation for an allowed host.
              expect(v.violations.some((x) => x.reason.startsWith('network attempt to '))).toBe(false);
            },
          ),
          { numRuns: NUM_RUNS },
        );
      },
      PBT_TIMEOUT ?? 0,
    );

    // Feature: wards, Property 9: Content inspection detects every supported encoding at every offset (P6, content criterion)
    // **Validates: Requirements 9.3, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.3, 11.4, 19.6, 19.7**
    it(
      'evaluate blocks a multi-line canary file whose lines were joined, sent to an allowed host',
      () => {
        fc.assert(
          fc.property(
            fc.array(plainCanaryArb, { minLength: 2, maxLength: 3 }),
            fc.constantFrom('\n', '\r\n'),
            fc.constantFrom('', ' ', '\n'),
            prefixArb,
            suffixArb,
            fc.boolean(),
            (lines, eol, glue, prefix, suffix, withRead) => {
              const file = utf8(lines.join(eol) + eol);
              const v = evaluateWith(
                'secrets/key.txt',
                'secrets/key.txt',
                file,
                assemble(prefix, lines.join(glue), suffix),
                'registry.npmjs.org',
                withRead,
                0,
                1,
              );
              expectContentBlock(v, 'secrets/key.txt', 'raw', lines.join(eol));
            },
          ),
          { numRuns: NUM_RUNS },
        );
      },
      PBT_TIMEOUT ?? 0,
    );
  });
});
