// TEMPORARY. Task 12.1 replaces `loadPlanTemporary` with `parsePlanFile` (src/plan/plan-file.ts).
// It checks only what the bundled plan files need: JSON syntax, `origin`, `actions[].command`
// as strings, and the optional `readings` array of strings. It is not the Plan_File codec.
import type { PlaygroundAction } from '@ghost-run/playground-shell';

export interface LoadedPlan {
  readonly name: string;
  readonly origin: 'recorded' | 'scripted';
  readonly actions: readonly PlaygroundAction[];
  readonly readings?: readonly string[];
}

export function loadPlanTemporary(text: string): LoadedPlan {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== 'object' || raw === null) throw new Error('plan file must be an object');
  const o = raw as Record<string, unknown>;
  const origin = o['origin'];
  if (origin !== 'recorded' && origin !== 'scripted') throw new Error('invalid origin');
  const actions = o['actions'];
  if (!Array.isArray(actions)) throw new Error('actions must be an array');
  const parsed: PlaygroundAction[] = actions.map((a: unknown) => {
    const command = (a as { command?: unknown } | null)?.command;
    if (typeof command !== 'string') throw new Error('action command must be a string');
    return { command };
  });
  const readings = o['readings'];
  if (readings !== undefined && !(Array.isArray(readings) && readings.every((r) => typeof r === 'string'))) {
    throw new Error('readings must be an array of strings');
  }
  const name = typeof o['name'] === 'string' ? o['name'] : '';
  return {
    name,
    origin,
    actions: parsed,
    ...(readings === undefined ? {} : { readings: readings as string[] }),
  };
}
