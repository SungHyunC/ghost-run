// Shared by the parity tests (Property L1): finds the record a live run must equal.
import type { PlanRecord, RunsFile, WorldId } from '../../src/data/types';

export type Which = 'plan' | 'fixed';

/**
 * The expected Plan_Record of a Preset (`plan`) or of its Fixed_Plan (`fixed`).
 * It comes from the committed file; when the committed file has no entry for the Preset,
 * `fresh` makes a fresh recording (the Record_Script into a temporary location) and the entry is read from that.
 */
export async function expectedRecord(
  committed: RunsFile,
  world: WorldId,
  presetId: string,
  which: Which,
  fresh: () => Promise<RunsFile>,
): Promise<PlanRecord> {
  const pick = (file: RunsFile): PlanRecord | undefined => {
    const entry = file.worlds[world].presets.find((p) => p.id === presetId);
    if (entry === undefined) return undefined;
    return which === 'plan' ? entry.plan : (entry.fixed ?? undefined);
  };
  const inCommitted = pick(committed);
  if (inCommitted !== undefined) return inCommitted;
  // A Preset without a Fixed_Plan has no `fixed` entry anywhere: that is a caller error, not a missing entry.
  const inFresh = pick(await fresh());
  if (inFresh === undefined) throw new Error(`no recorded entry for ${presetId} (${which}), not even in a fresh recording`);
  return inFresh;
}
