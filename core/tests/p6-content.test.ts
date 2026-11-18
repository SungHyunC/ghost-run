import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PAYLOAD_CAP, createInspector, detectKinds } from '../src/judge/inspect.js';
import type { EncodingKind } from '../src/judge/inspect.js';
import { base64, base64url, breakLines, hex, percentAll, utf8 } from './fixtures/encoders.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';

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

describe('P6 content inspection', () => {
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
      () => {
        const layerArb = fc.constantFrom<{ kind: EncodingKind; enc: (c: string) => string }>(
          { kind: 'raw', enc: (c) => c },
          { kind: 'base64', enc: (c) => base64(utf8(c), true) },
          { kind: 'base64', enc: (c) => breakLines(base64(utf8(c), false), 76) },
          { kind: 'base64url', enc: (c) => base64url(utf8('xx' + c), false).slice(3) },
          { kind: 'hex', enc: (c) => hex(utf8(c), 'upper') },
          { kind: 'hex', enc: (c) => hex(utf8(c), 'mixed') },
          { kind: 'percent', enc: (c) => percentAll(utf8(c)) },
        );
        fc.assert(
          fc.property(
            canaryArb,
            layerArb,
            fc.integer({ min: 0, max: 40 }),
            fc.integer({ min: 0, max: 5000 }),
            (canary, layer, slack, extra) => {
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
});
