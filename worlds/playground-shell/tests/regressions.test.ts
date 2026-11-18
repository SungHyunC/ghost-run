import { describe, expect, it } from 'vitest';
import { createPlaygroundWorld } from '../src/world.js';
import './support/setup.js';

// Shrunk counterexamples found by property tests, kept as plain examples.

const sql = { run: () => Promise.resolve({ ok: false as const, stderr: 'sql not available' }) };
const enc = new TextEncoder();

describe('regressions', () => {
  describe('Property 3: No silent pass', () => {
    it('an unsupported command after an effect keeps the effect and skips the tail', async () => {
      const w = createPlaygroundWorld(
        { name: 'demo', entries: { 'a.txt': { kind: 'file', bytes: enc.encode('x') } } },
        { secretPatterns: [], sql },
      );
      const s = await w.snapshot();
      const next = await w.step(s, { command: 'rm a.txt ; zzfoo ; mkdir late' });
      expect(next.result).toEqual({ success: false, error: 'unsupported: command not supported: zzfoo' });
      expect(Object.keys(next.state.entries)).toEqual([]);
    });
  });
});
