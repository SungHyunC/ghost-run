// The walkthrough reads one WorldRecord per world. Until the controller of the live section lands, the
// recorded view is the first Preset of each world (it has a Fixed_Plan), taken from the Runs_File.

import type { PlanRecord, PresetRecord, RunOutcome, RunsFile, WalkRecord, WalkRuns, WorldRecord, WorldRecordV2 } from './types';

/** How a run ends, as the walkthrough shows it. `unsupported` never comes from a recording. */
export function outcomeOf(plan: PlanRecord, hasFixed: boolean): RunOutcome {
  if (plan.verdict === 'block') return hasFixed ? 'block-fixed' : 'block-open';
  return plan.verdict;
}

/** Builds the walkthrough record of one Preset of a recorded world. */
export function toWalkRecord(world: WorldRecordV2, preset: PresetRecord): WorldRecord {
  return {
    id: world.id,
    ward: world.ward,
    reality: world.reality,
    plan: preset.plan,
    fixed: preset.fixed,
    outcome: outcomeOf(preset.plan, preset.fixed !== null),
    source: 'recorded',
  };
}

function firstWithFix(world: WorldRecordV2): WalkRecord {
  const preset = world.presets.find((p) => p.fixed !== null);
  if (preset === undefined || preset.fixed === null) throw new Error(`runs: ${world.id} has no Preset with a Fixed_Plan`);
  return { ...toWalkRecord(world, preset), fixed: preset.fixed };
}

export function toWalkRuns(runs: RunsFile): WalkRuns {
  return {
    seed: runs.seed,
    variantCount: runs.variantCount,
    worlds: { shell: firstWithFix(runs.worlds.shell), hand: firstWithFix(runs.worlds.hand), cloud: firstWithFix(runs.worlds.cloud) },
  };
}
