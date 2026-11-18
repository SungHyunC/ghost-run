// Property test for the blacklight hook (task 13.2). [no-docker]
// Every file lives in a temporary folder outside the repository and is removed afterwards.
import fc from 'fast-check';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exitCodeFor, scanTexts } from '@ghost-run/core';
import { describe, expect, it } from 'vitest';
import { runBlacklightHook } from '../lib/blacklight/run.mjs';
import { makeTempStore } from './fixtures/index.mjs';
import { FC_PARAMS } from './pbt-config.mjs';

// Hidden code points, built from numbers (never literal): zero-width, bidi, tag characters.
const HIDDEN = [0x200b, 0x200c, 0x2060, 0xfeff, 0x202a, 0x202e, 0x2066, 0x2069, 0xe0041, 0xe0061, 0xe007f].map(
  (cp) => String.fromCodePoint(cp),
);

const word = fc.stringMatching(/^[a-z]{1,8}$/);
const plainText = fc
  .array(fc.oneof(word, fc.constantFrom(' ', '\n', '# ', '- ')), { minLength: 1, maxLength: 12 })
  .map((parts) => `a${parts.join('')}z`);

/** Plain text, optionally with a hidden character inserted between two ASCII letters. */
const contentArb = fc.tuple(plainText, fc.option(fc.constantFrom(...HIDDEN), { nil: undefined }), fc.nat(1000)).map(
  ([text, hidden, at]) => {
    if (hidden === undefined) return { text, hidden: false };
    const i = 1 + (at % (text.length - 1)); // between the first and last ASCII letter
    return { text: text.slice(0, i) + hidden + text.slice(i), hidden: true };
  },
);

const nameArb = fc.constantFrom('rule.md', 'notes.markdown', 'config.json', 'data.txt', 'noext');

describe('Property 20: Blacklight hook reports and does not write', () => {
  // Feature: kiro-integration, Property 20: Blacklight hook reports and does not write
  // **Validates: Requirements 17.1, 17.2, 17.3, 17.4**
  it('exit code equals exitCodeFor(outcome), findings exactly when hidden, file bytes unchanged', async () => {
    const tmp = makeTempStore();
    try {
      mkdirSync(join(tmp.dir, '.kiro', 'steering'), { recursive: true });
      await fc.assert(
        fc.asyncProperty(contentArb, nameArb, async ({ text, hidden }, name) => {
          const rel = `.kiro/steering/${name}`;
          const abs = join(tmp.dir, rel);
          writeFileSync(abs, text, 'utf8');
          const before = readFileSync(abs);
          const out = await runBlacklightHook(JSON.stringify({ file_path: rel }), tmp.dir);
          const expected = scanTexts([{ path: rel, text }], { markdown: 'by-extension' });
          expect(out.ran).toBe(true);
          expect(expected.outcome).toBe(hidden ? 'findings' : 'clean');
          expect(out.exit).toBe(exitCodeFor(expected.outcome));
          expect(out.stdout).toContain(`outcome=${expected.outcome} `);
          expect(out.stderr === '').toBe(expected.outcome === 'clean');
          expect(/^[\n\x20-\x7e]*$/.test(out.stdout)).toBe(true);
          expect(readFileSync(abs).equals(before)).toBe(true);
        }),
        FC_PARAMS,
      );
    } finally {
      tmp.cleanup();
    }
  });
});
