import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlanRecord, RunsFile } from '../../src/data/types';
import { classify, toRecordedWalkRecord, toWalkRecord } from '../../src/live/classify';
import type { LiveAnswer, LiveRun } from '../../src/live/types';

const runs = JSON.parse(readFileSync(resolve(__dirname, '../../src/data/runs.json'), 'utf8')) as RunsFile;
const base = runs.worlds.shell;

function ran(verdict: PlanRecord['verdict']): LiveAnswer {
  const plan = { ...base.presets[0]!.plan, verdict };
  return { status: 'ran', run: { world: 'shell', ward: base.ward, reality: base.reality, plan } };
}

describe('classify', () => {
  it('maps the five Outcomes', () => {
    expect(classify({ status: 'unsupported', reason: 'x', stepIndexes: [0] }, null)).toBe('unsupported');
    expect(classify({ status: 'rejected', problem: 'empty' }, null)).toBe('unsupported');
    expect(classify(ran('pass'), null)).toBe('pass');
    expect(classify(ran('warn'), null)).toBe('warn');
    expect(classify(ran('block'), ran('pass'))).toBe('block-fixed');
    expect(classify(ran('block'), null)).toBe('block-open');
  });

  it('gives block-open when the Fixed_Plan failed', () => {
    expect(classify(ran('block'), { status: 'failed', cause: 'run' })).toBe('block-open');
  });
});

describe('toWalkRecord', () => {
  const first = (ran('block') as { run: LiveRun }).run;

  it('keeps fixed null for Visitor_Input and sets unsupported only when given', () => {
    const r = toWalkRecord(first, null, 'block-open', 'live');
    expect(r.fixed).toBeNull();
    expect('unsupported' in r).toBe(false);
    const u = toWalkRecord(first, null, 'unsupported', 'live', { reason: 'r', known: ['a'] });
    expect(u.unsupported).toEqual({ reason: 'r', known: ['a'] });
  });

  it('gives recorded records the same shape as live records', () => {
    for (const world of Object.values(runs.worlds)) {
      for (const preset of world.presets) {
        const recorded = toRecordedWalkRecord(world, preset);
        const fixedRun: LiveRun | null =
          preset.fixed === null ? null : { world: world.id, ward: world.ward, reality: world.reality, plan: preset.fixed };
        const live = toWalkRecord(
          { world: world.id, ward: world.ward, reality: world.reality, plan: preset.plan },
          fixedRun,
          recorded.outcome,
          'recorded',
        );
        expect(recorded).toEqual(live);
        expect(recorded.source).toBe('recorded');
      }
    }
  });
});
