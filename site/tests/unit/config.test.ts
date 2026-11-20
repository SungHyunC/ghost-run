import { describe, expect, it } from 'vitest';
import { DOC_TITLE, DUR, REPO_URL, STEPS } from '../../src/config';

describe('config', () => {
  it('keeps the walkthrough step durations', () => {
    expect([...DUR]).toEqual([2700, 3900, 3300, 2700, 5200]);
  });

  it('has five steps with the labels of the walkthrough rail', () => {
    expect(STEPS.map((s) => s.label)).toEqual(['Copy', 'Run on the copy', 'Judge', 'Verdict', 'Fix and go']);
    expect(STEPS.map((s) => s.num)).toEqual([1, 2, 3, 4, 5]);
    expect(STEPS.map((s) => s.code)).toEqual(['snapshot()', 'step()', 'diff() · effectsOutside()', 'render() · fingerprint()', 'the agent tries again']);
  });

  it('uses one https repository URL', () => {
    expect(REPO_URL).toBe('https://github.com/SungHyunC/ghost-run');
    expect(REPO_URL).toMatch(/^https:\/\/[^\s]+$/);
    expect(new URL(REPO_URL).protocol).toBe('https:');
  });

  it('has the document title', () => {
    expect(DOC_TITLE).toBe("Ghost Run+: let your agent's ghost try it first");
  });
});
