import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultWardsText, runDemo } from '../scripts/run-demo.js';

const FINGERPRINT = 'ed34d2240ad1';

// The text of the demo with the shipped wards.yaml. The README sections "Try it" and
// "Try it in one minute" show the same block.
const SHIPPED = [
  'plan: clear',
  '  blocked by ward keep-todos: the copy lost 3 to-dos',
  `  real list unchanged: true (fingerprint ${FINGERPRINT} before and after)`,
  'plan: remove 2',
  '  blocked by ward keep-todos: the copy lost 1 to-do',
  `  real list unchanged: true (fingerprint ${FINGERPRINT} before and after)`,
  'plan: add "buy candles"',
  '  passed: 1 action, the copy lost 0 to-dos',
].join('\n');

// The same demo after the "Change a rule" step: only the first to-do is protected.
const CHANGED = [
  'plan: clear',
  '  blocked by ward keep-todos: the copy lost 3 to-dos',
  `  real list unchanged: true (fingerprint ${FINGERPRINT} before and after)`,
  'plan: remove 2',
  '  passed: 1 action, the copy lost 1 to-do',
  'plan: add "buy candles"',
  '  passed: 1 action, the copy lost 0 to-dos',
].join('\n');

describe('demo output', () => {
  it('blocks clear and remove 2 with the ward id and the lost count, and passes add', async () => {
    expect(await runDemo()).toBe(SHIPPED);
  });

  it('with paths ["todos/1"], remove 2 passes and clear is still blocked', async () => {
    const changed = defaultWardsText().replace('paths: ["todos/*"]', 'paths: ["todos/1"]');
    expect(changed).not.toBe(defaultWardsText());
    expect(await runDemo(changed)).toBe(CHANGED);
  });

  it('the plain demo reads the shipped wards.yaml', async () => {
    expect(await runDemo(defaultWardsText())).toBe(SHIPPED);
  });

  it('throws a clear error for a wards text that does not parse', async () => {
    await expect(runDemo('wards: [')).rejects.toThrow('wards.yaml does not parse');
  });

  it('both README output blocks match the program output', async () => {
    const root = new URL('../../../', import.meta.url);
    const blocks = (text: string): string[] => [...text.matchAll(/```\n(plan: clear\n[\s\S]*?)\n```/g)].map((m) => m[1] ?? '');
    for (const rel of ['README.md', 'worlds/starter/README.md']) {
      const found = blocks(readFileSync(new URL(rel, root), 'utf8'));
      expect(found, rel).toEqual([SHIPPED, CHANGED]);
    }
  });
});
