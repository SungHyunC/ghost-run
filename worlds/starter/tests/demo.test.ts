import { describe, expect, it } from 'vitest';
import { runDemo } from '../scripts/run-demo.js';

describe('demo output', () => {
  it('blocks clear with the ward id and the lost count, and passes add', async () => {
    const out = await runDemo();
    expect(out).toContain('blocked by ward keep-todos: the copy lost 3 to-dos');
    expect(out).toContain('real list unchanged: true');
    expect(out).toContain('passed: 1 action');
    expect(out.split('\n').length).toBeLessThanOrEqual(10);
  });
});
