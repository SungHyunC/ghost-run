// Feature: ghost-cloud, Property 11: Demo verdicts and exact ward sets
// **Validates: Requirements 5.4, 5.5, 7.2, 7.3, 7.5**
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseWards } from '@ghost-run/wards-config';
import { runGhostCloudPlan } from '../src/pipeline/run-plan.js';
import { DEMO_PLANS } from '../src/demo.js';

function loadWards() {
  const parsed = parseWards(readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8'));
  if (!parsed.ok) throw new Error('wards.yaml does not parse');
  return parsed.wardSet;
}

function planFile(name: string): string[] {
  const rows = readFileSync(new URL(`../demo/${name}`, import.meta.url), 'utf8').split('\n');
  if (rows[rows.length - 1] === '') rows.pop();
  return rows;
}

describe('demo plans through the Pipeline_Entry', () => {
  const wardSet = loadWards();
  const expected: Record<string, { verdict: string; wards: string[] }> = {
    a: { verdict: 'block', wards: ['no-bucket-delete'] },
    b: { verdict: 'block', wards: ['no-public-bucket'] },
    c: { verdict: 'pass', wards: [] },
    d: { verdict: 'warn', wards: [] },
  };

  for (const plan of DEMO_PLANS) {
    it(`plan (${plan.id}) ${plan.title}`, async () => {
      const run = await runGhostCloudPlan(plan.lines, wardSet);
      const want = expected[plan.id]!;
      expect(run.verdict).toBe(want.verdict);
      expect([...new Set(run.wardVerdict.violations.map((v) => v.wardId))].sort()).toEqual(want.wards);
      expect(run.p1.equal).toBe(true);
      expect(run.lines.every((l) => l.result.ok)).toBe(true);
      if (want.verdict === 'block') expect(run.message).toContain(want.wards[0]!);
    });

    it(`plan (${plan.id}) file equals DEMO_PLANS`, () => {
      expect(planFile(plan.file)).toEqual([...plan.lines]);
    });
  }

  it('plan (d) has one effect-outside notice with destination s3.example', async () => {
    const run = await runGhostCloudPlan(DEMO_PLANS[3]!.lines, wardSet);
    const notices = run.wardVerdict.notices.filter((n) => n.kind === 'effect-outside');
    expect(notices).toHaveLength(1);
    expect(notices[0]?.destination).toBe('s3.example');
  });
});
