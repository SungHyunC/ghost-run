// The demo plans: three plans through the same pipeline the apps use (ghostRun, WardEngine).
import { readFileSync } from 'node:fs';
import { WardEngine, ghostRun } from '@ghost-run/core';
import type { WardSet } from '@ghost-run/core';
import { parseWards } from '@ghost-run/wards-config';
import config from '../world.config.js';
import type { Action } from '../src/world.js';

/** The text of the wards file next to this package. */
export function defaultWardsText(): string {
  return readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8');
}

/** Parses a wards text. Throws `wards.yaml does not parse` when it is not valid. */
export function loadWards(text: string): WardSet {
  const parsed = parseWards(text);
  if (!parsed.ok) throw new Error('wards.yaml does not parse');
  return parsed.wardSet;
}

const toDos = (n: number): string => `${n} ${n === 1 ? 'to-do' : 'to-dos'}`;

/** Runs one plan on a fresh world and returns the printed lines. Never changes the real list. */
export async function runPlan(label: string, plan: readonly Action[], wardSet: WardSet): Promise<string[]> {
  const world = config.create();
  const before = await world.fingerprint();
  const report = await ghostRun(world, await world.snapshot(), plan);
  const after = await world.fingerprint();
  const verdict = WardEngine.evaluate(report, wardSet);
  const lost = report.changes.flat().filter((c) => c.kind === 'file-deleted').length;
  const out = [`plan: ${label}`];
  if (verdict.verdict === 'block') {
    const ward = verdict.violations[0]?.wardId ?? 'unknown';
    out.push(`  blocked by ward ${ward}: the copy lost ${toDos(lost)}`);
    out.push(`  real list unchanged: ${before.hash === after.hash} (fingerprint ${before.hash.slice(0, 12)} before and after)`);
  } else {
    out.push(`  ${verdict.verdict === 'pass' ? 'passed' : verdict.verdict}: ${plan.length} action, the copy lost ${toDos(lost)}`);
  }
  return out;
}

/** Runs the three demo plans. `wardsText` replaces the wards file of the package (used by the tests and `--wards`). */
export async function runDemo(wardsText: string = defaultWardsText()): Promise<string> {
  const wardSet = loadWards(wardsText);
  const lines = [
    ...(await runPlan('clear', [{ kind: 'clear' }], wardSet)),
    ...(await runPlan('remove 2', [{ kind: 'remove', id: 2 }], wardSet)),
    ...(await runPlan('add "buy candles"', [{ kind: 'add', text: 'buy candles' }], wardSet)),
  ];
  return lines.join('\n');
}
