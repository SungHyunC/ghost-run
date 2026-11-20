// The refusals of the Record_Script, as a pure function over the finished Runs_File.
// The measure file calls it before it writes anything; a non-empty list means: exit non-zero, write nothing.

import type { RunsFile } from '../../src/data/types';

/** Presets that the spec names as blocking. Their Fixed_Plans must pass. Other Presets have no expected verdict. */
export const NAMED_BLOCKING: readonly string[] = ['shell-drop-users', 'shell-rm-data-build', 'hand-fast-pull', 'cloud-delete-prod'];

export function validateRecords(file: RunsFile): string[] {
  const problems: string[] = [];
  if (file.format !== 'ghost-site-runs' || file.version !== 2) problems.push('format or version is not ghost-site-runs 2');
  const seen = new Set<string>();
  for (const world of Object.values(file.worlds)) {
    if (world.presets.length !== 3) problems.push(`${world.id}: expected 3 Presets, got ${world.presets.length}`);
    for (const preset of world.presets) {
      seen.add(preset.id);
      const runs = [
        { name: `${preset.id} plan`, plan: preset.plan },
        ...(preset.fixed === null ? [] : [{ name: `${preset.id} fixed`, plan: preset.fixed }]),
      ];
      for (const r of runs) {
        if (!r.plan.p1.equal || r.plan.p1.before !== r.plan.p1.after) {
          problems.push(`${r.name}: the fingerprint of reality changed during the ghost run`);
        }
      }
      if (NAMED_BLOCKING.includes(preset.id)) {
        if (preset.plan.verdict !== 'block') problems.push(`${preset.id}: expected verdict block, got ${preset.plan.verdict}`);
        if (preset.fixed === null) problems.push(`${preset.id}: the Fixed_Plan is missing`);
      }
      if (preset.fixed !== null && preset.fixed.verdict !== 'pass') {
        problems.push(`${preset.id} fixed: expected verdict pass, got ${preset.fixed.verdict}`);
      }
    }
  }
  for (const id of NAMED_BLOCKING) if (!seen.has(id)) problems.push(`${id}: Preset missing from the file`);
  return problems;
}
