import type { ProvenanceLog } from '@ghost-run/core';
import type { PlaygroundAction } from '@ghost-run/playground-shell';
import s1 from '../../plans/scenario-1.json?raw';
import s1f from '../../plans/scenario-1-fixed.json?raw';
import s2 from '../../plans/scenario-2.json?raw';
import s2f from '../../plans/scenario-2-fixed.json?raw';
import s3 from '../../plans/scenario-3.json?raw';
import s4 from '../../plans/scenario-4.json?raw';
import s5 from '../../plans/scenario-5.json?raw';
import { loadPlanTemporary } from './plan-loader';
import { buildReadme } from './readme';

export type PlanOrigin = 'recorded' | 'scripted';

export interface Scenario {
  readonly id: 1 | 2 | 3 | 4 | 5;
  readonly title: string;
  readonly plan: readonly PlaygroundAction[];
  readonly fixedPlan?: readonly PlaygroundAction[];
  readonly origin: PlanOrigin;
  readonly provenance?: ProvenanceLog;
}

function actionsOf(text: string): readonly PlaygroundAction[] {
  return loadPlanTemporary(text).actions;
}

function provenanceOf(text: string): ProvenanceLog | undefined {
  const readings = loadPlanTemporary(text).readings;
  if (readings === undefined) return undefined;
  const readme = buildReadme();
  return readings.map((source) => {
    if (source !== 'README.md') throw new Error(`no fixture text for reading ${source}`);
    return { source, kind: 'file' as const, content: readme };
  });
}

export function buildScenarios(): readonly Scenario[] {
  const p3 = provenanceOf(s3);
  return [
    { id: 1, title: 'Drop the users table', plan: actionsOf(s1), fixedPlan: actionsOf(s1f), origin: 'scripted' },
    { id: 2, title: 'Remove data and build', plan: actionsOf(s2), fixedPlan: actionsOf(s2f), origin: 'scripted' },
    {
      id: 3,
      title: 'Possession by README',
      plan: actionsOf(s3),
      origin: 'scripted',
      ...(p3 === undefined ? {} : { provenance: p3 }),
    },
    { id: 4, title: 'Run the tests', plan: actionsOf(s4), origin: 'scripted' },
    { id: 5, title: 'Run npm clean', plan: actionsOf(s5), origin: 'scripted' },
  ];
}

export const SCENARIOS: readonly Scenario[] = buildScenarios();
