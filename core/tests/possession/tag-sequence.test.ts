// Unit tests for permittedTagSequenceEnd. Validates: Requirements 2.9, 2.10, 2.11.
// Every special character is built from code points; none is written literally.

import { describe, expect, it } from 'vitest';
import { permittedTagSequenceEnd } from '../../src/possession/tag-sequence.js';
import { RGI_TAG_SEQUENCES } from '../../src/possession/tag-sequence-table.generated.js';

const BASE = 0x1f3f4;
const CANCEL = 0xe007f;
const tag = (ch: string): number => 0xe0000 + ch.charCodeAt(0);
const s = (...cps: number[]): string => String.fromCodePoint(...cps);
const tags = (word: string): number[] => [...word].map(tag);

describe('permittedTagSequenceEnd', () => {
  it('has the three listed entries', () => {
    expect(RGI_TAG_SEQUENCES.length).toBe(3);
  });

  describe('listed entries', () => {
    for (const seq of RGI_TAG_SEQUENCES) {
      const entry = s(...seq);
      const label = seq.map((c) => c.toString(16)).join(' ');
      it(`returns the end index for ${label}`, () => {
        expect(permittedTagSequenceEnd(entry, 0)).toBe(entry.length);
      });
      it(`returns the end index for ${label} at an offset, with trailing text`, () => {
        const text = 'ab' + entry + 'cd';
        expect(permittedTagSequenceEnd(text, 2)).toBe(2 + entry.length);
      });
      it(`stops at the first cancel tag for ${label} followed by more tags`, () => {
        const text = entry + s(tag('a'));
        expect(permittedTagSequenceEnd(text, 0)).toBe(entry.length);
      });
    }
  });

  describe('near misses return -1', () => {
    it('prefix of a listed entry without the cancel tag', () => {
      for (const seq of RGI_TAG_SEQUENCES) {
        const prefix = s(...seq.slice(0, -1));
        expect(permittedTagSequenceEnd(prefix, 0)).toBe(-1);
        expect(permittedTagSequenceEnd(prefix + 'x', 0)).toBe(-1);
      }
    });

    it('flag-shaped sequence that is not listed', () => {
      expect(permittedTagSequenceEnd(s(BASE, ...tags('gbxyz'), CANCEL), 0)).toBe(-1);
      expect(permittedTagSequenceEnd(s(BASE, ...tags('gbeng'), tag('x'), CANCEL), 0)).toBe(-1);
      expect(permittedTagSequenceEnd(s(BASE, ...tags('gbeg'), CANCEL), 0)).toBe(-1);
    });

    it('base directly followed by the cancel tag', () => {
      expect(permittedTagSequenceEnd(s(BASE, CANCEL), 0)).toBe(-1);
    });

    it('extra tag before the first cancel tag', () => {
      for (const seq of RGI_TAG_SEQUENCES) {
        const withExtra = s(...seq.slice(0, -1), tag('x'), CANCEL);
        expect(permittedTagSequenceEnd(withExtra, 0)).toBe(-1);
      }
    });

    it('non-tag code point inside the run', () => {
      expect(permittedTagSequenceEnd(s(BASE, ...tags('gb'), 0x78, ...tags('eng'), CANCEL), 0)).toBe(-1);
    });

    it('base alone', () => {
      expect(permittedTagSequenceEnd(s(BASE), 0)).toBe(-1);
    });
  });

  describe('never reads past the end of the string', () => {
    it('flag at the very end of the string', () => {
      const entry = s(...RGI_TAG_SEQUENCES[0]!);
      expect(permittedTagSequenceEnd('x' + entry, 1)).toBe(1 + entry.length);
    });

    it('every truncation of every entry returns -1', () => {
      for (const seq of RGI_TAG_SEQUENCES) {
        const full = s(...seq);
        for (let len = 0; len < full.length; len++) {
          expect(permittedTagSequenceEnd(full.slice(0, len), 0)).toBe(-1);
        }
      }
    });

    it('truncation that splits a tag surrogate pair returns -1', () => {
      for (const seq of RGI_TAG_SEQUENCES) {
        const full = s(...seq);
        for (let k = 2; k < full.length; k += 2) {
          // k is the index of a tag high surrogate; keep only that high unit.
          expect(full.charCodeAt(k)).toBe(0xdb40);
          expect(permittedTagSequenceEnd(full.slice(0, k + 1), 0)).toBe(-1);
        }
      }
    });

    it('lone high surrogate 0xDB40 right after the base returns -1', () => {
      const text = s(BASE) + String.fromCharCode(0xdb40);
      expect(permittedTagSequenceEnd(text, 0)).toBe(-1);
    });

    it('high surrogate 0xDB40 followed by a non-tag low surrogate returns -1', () => {
      const text = s(BASE) + String.fromCharCode(0xdb40, 0xdc80);
      expect(permittedTagSequenceEnd(text, 0)).toBe(-1);
    });

    it('base at the very end returns -1', () => {
      expect(permittedTagSequenceEnd(s(BASE), 0)).toBe(-1);
      expect(permittedTagSequenceEnd('x' + s(BASE), 1)).toBe(-1);
    });
  });
});
