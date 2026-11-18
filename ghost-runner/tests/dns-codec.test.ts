// Feature: ghost-runner, Property 15: DNS codec
// **Validates: Requirements 8.1, 8.3**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LoopbackAllocator,
  QTYPE_A,
  QTYPE_AAAA,
  answer,
  decodeQuery,
  encodeQuery,
} from '../src/recorder/dns-codec.js';
import { pbtParams, testTimeoutMs } from './pbt-config.js';

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const LABEL_CHARS = [...ALNUM, '-'];

const label = fc
  .tuple(
    fc.constantFrom(...ALNUM),
    fc.array(fc.constantFrom(...LABEL_CHARS), { maxLength: 20 }),
  )
  .map(([first, rest]) => first + rest.join(''));

const hostname = fc.array(label, { minLength: 1, maxLength: 5 }).map((l) => l.join('.'));
const queryId = fc.integer({ min: 0, max: 0xffff });

function header(packet: Uint8Array) {
  const v = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  return { id: v.getUint16(0), flags: v.getUint16(2), ancount: v.getUint16(6) };
}

function answerAddress(response: Uint8Array): string {
  const tail = response.slice(response.length - 4);
  return Array.from(tail).join('.');
}

describe('Feature: ghost-runner, Property 15: DNS codec', () => {
  it(
    'decodes an encoded A query to the lowercase hostname',
    () => {
      fc.assert(
        fc.property(queryId, hostname, (id, name) => {
          const q = decodeQuery(encodeQuery(id, name, QTYPE_A));
          expect(q).toBeDefined();
          expect(q?.name).toBe(name.toLowerCase());
          expect(q?.id).toBe(id);
          expect(q?.qtype).toBe(QTYPE_A);
        }),
        pbtParams(),
      );
    },
    testTimeoutMs(false),
  );

  it(
    'answers A with exactly one stable loopback address per name',
    () => {
      fc.assert(
        fc.property(queryId, fc.array(hostname, { minLength: 1, maxLength: 8 }), (id, names) => {
          const alloc = new LoopbackAllocator();
          const seen = new Map<string, string>();
          for (const name of [...names, ...names]) {
            const r = answer(encodeQuery(id, name, QTYPE_A), alloc);
            expect(r).toBeDefined();
            const h = header(r!.response);
            expect(h.id).toBe(id);
            expect(h.flags & 0x8000).toBe(0x8000);
            expect(h.flags & 0xf).toBe(0);
            expect(h.ancount).toBe(1);
            const addr = answerAddress(r!.response);
            expect(addr).toBe(r!.address);
            expect(addr).toMatch(/^127\.\d+\.\d+\.\d+$/);
            expect(addr.startsWith('127.0.0.')).toBe(false);
            const key = name.toLowerCase();
            const prev = seen.get(key);
            if (prev !== undefined) expect(addr).toBe(prev);
            seen.set(key, addr);
            expect(alloc.lookup(addr)).toBe(key);
          }
          expect(new Set(seen.values()).size).toBe(seen.size);
        }),
        pbtParams(),
      );
    },
    testTimeoutMs(false),
  );

  it(
    'answers AAAA with NOERROR and no answers',
    () => {
      fc.assert(
        fc.property(queryId, hostname, (id, name) => {
          const r = answer(encodeQuery(id, name, QTYPE_AAAA), new LoopbackAllocator());
          expect(r).toBeDefined();
          const h = header(r!.response);
          expect(h.id).toBe(id);
          expect(h.flags & 0x8000).toBe(0x8000);
          expect(h.flags & 0xf).toBe(0);
          expect(h.ancount).toBe(0);
          expect(r!.address).toBeUndefined();
        }),
        pbtParams(),
      );
    },
    testTimeoutMs(false),
  );

  it('rejects truncated packets', () => {
    expect(decodeQuery(new Uint8Array(5))).toBeUndefined();
    const p = encodeQuery(1, 'a.example', QTYPE_A);
    expect(decodeQuery(p.slice(0, p.length - 3))).toBeUndefined();
  });
});
