import { describe, expect, it } from 'vitest';
import { NAMED_BLOCKING, validateRecords } from '../../scripts/lib/validate-records';
import runsJson from '../../src/data/runs.json';
import type { PlanRecord, RunsFile } from '../../src/data/types';

const good = (): RunsFile => structuredClone(runsJson) as unknown as RunsFile;

function planOf(file: RunsFile, id: string): { plan: PlanRecord; fixed: PlanRecord | null } {
  for (const w of Object.values(file.worlds)) {
    const p = w.presets.find((x) => x.id === id);
    if (p !== undefined) return p;
  }
  throw new Error(id);
}

describe('validateRecords (the refusals of the Record_Script)', () => {
  it('accepts the committed file', () => {
    expect(validateRecords(good())).toEqual([]);
  });

  it('names the four blocking Presets of the spec', () => {
    expect(NAMED_BLOCKING).toEqual(['shell-drop-users', 'shell-rm-data-build', 'hand-fast-pull', 'cloud-delete-prod']);
  });

  it('refuses a named Preset that does not block', () => {
    const file = good();
    planOf(file, 'hand-fast-pull').plan.verdict = 'pass';
    expect(validateRecords(file).join('\n')).toContain('hand-fast-pull: expected verdict block');
  });

  it('refuses a Fixed_Plan that does not pass', () => {
    const file = good();
    const fixed = planOf(file, 'shell-drop-users').fixed;
    if (fixed === null) throw new Error('fixed');
    fixed.verdict = 'block';
    expect(validateRecords(file).join('\n')).toContain('shell-drop-users fixed: expected verdict pass');
  });

  it('refuses unequal fingerprints in any run', () => {
    const file = good();
    const open = planOf(file, 'shell-npm-test').plan;
    open.p1 = { equal: false, before: 'a', after: 'b' };
    expect(validateRecords(file).join('\n')).toContain('shell-npm-test plan: the fingerprint of reality changed');
  });

  it('accepts any verdict for a Preset without an expected value', () => {
    const file = good();
    planOf(file, 'cloud-make-public').plan.verdict = 'warn';
    expect(validateRecords(file)).toEqual([]);
  });

  it('refuses another format or version', () => {
    const file = good() as unknown as { version: number };
    file.version = 1;
    expect(validateRecords(file as unknown as RunsFile)).toContain('format or version is not ghost-site-runs 2');
  });
});
