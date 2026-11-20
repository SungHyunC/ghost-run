// From a live run to the walkthrough: the Outcome and the WorldRecord. Pure; no engine import.

import { toWalkRecord as recordedToWalkRecord } from '../data/walk-records';
import type { PresetRecord, WorldRecord, WorldRecordV2 } from '../data/types';
import type { LiveAnswer, LiveRun, Outcome, UnsupportedNote } from './types';

/**
 * `unsupported` or `rejected` first answer: unsupported. Verdict pass or warn: the same. Verdict block: block-fixed when
 * the Fixed_Plan ran, else block-open (also when the Fixed_Plan failed). A `failed` first answer belongs to the controller.
 */
export function classify(first: LiveAnswer, fixed: LiveAnswer | null): Outcome {
  if (first.status !== 'ran') return 'unsupported';
  const verdict = first.run.plan.verdict;
  if (verdict === 'pass' || verdict === 'warn') return verdict;
  return fixed !== null && fixed.status === 'ran' ? 'block-fixed' : 'block-open';
}

/** The record the walkthrough reads. `fixed` stays null for Visitor_Input and when no fix ran. */
export function toWalkRecord(
  run: LiveRun,
  fixed: LiveRun | null,
  outcome: Outcome,
  source: 'live' | 'recorded',
  unsupported?: UnsupportedNote,
): WorldRecord {
  const record: WorldRecord = {
    id: run.world,
    ward: run.ward,
    reality: run.reality,
    plan: run.plan,
    fixed: fixed === null ? null : fixed.plan,
    outcome,
    source,
  };
  if (unsupported !== undefined) record.unsupported = unsupported;
  return record;
}

/**
 * The record of input the ghost does not know: step 1 only. The ward, the Reality scene, and the shape of the
 * plan come from the first recorded Preset of the world; the plan shows the visitor's text as `display`.
 */
export function toUnsupportedRecord(
  world: WorldRecordV2,
  commands: string[],
  display: string,
  note: UnsupportedNote,
): WorldRecord {
  const template = world.presets[0]?.plan;
  if (template === undefined) throw new Error(`classify: ${world.id} has no recorded Preset`);
  return {
    id: world.id,
    ward: world.ward,
    reality: world.reality,
    plan: { ...template, commands, display, verdict: 'pass', violatedWardIds: [], checks: [], effectsOutside: [], facts: {}, message: '' },
    fixed: null,
    outcome: 'unsupported',
    source: 'live',
    unsupported: note,
  };
}

/** The fallback record of a Preset from the committed Runs_File (`source: 'recorded'`). */
export function toRecordedWalkRecord(world: WorldRecordV2, preset: PresetRecord): WorldRecord {
  return recordedToWalkRecord(world, preset);
}
