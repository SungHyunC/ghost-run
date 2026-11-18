// The two demo scenarios (requirements 11.4, 12.1). Each one is its shipped Plan_File, parsed by
// `parsePlanFile`; no scenario table duplicates the actions.
import firstText from '../../plans/first.plan.json?raw';
import revisedText from '../../plans/revised.plan.json?raw';
import { parsePlanFile } from './plan-file';
import type { PlanFile } from './plan-file';

export type ScenarioId = 'fast-pull' | 'slow-pull';

export interface Scenario {
  readonly id: ScenarioId;
  /** Button label; equals the `name` of the Plan_File. */
  readonly label: string;
  readonly plan: PlanFile;
}

function load(id: ScenarioId, text: string): Scenario {
  const parsed = parsePlanFile(text);
  if (!parsed.ok) {
    throw new Error(`shipped plan ${id} is invalid: ${parsed.errors.map((e) => e.field).join(', ')}`);
  }
  return { id, label: parsed.plan.name, plan: parsed.plan };
}

export const FIRST_SCENARIO: Scenario = load('fast-pull', firstText);
export const REVISED_SCENARIO: Scenario = load('slow-pull', revisedText);
export const SCENARIOS: readonly Scenario[] = [FIRST_SCENARIO, REVISED_SCENARIO];
