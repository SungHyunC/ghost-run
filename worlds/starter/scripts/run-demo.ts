// The demo plans: two plans through the same pipeline the apps use (ghostRun, WardEngine).
import { readFileSync } from 'node:fs';
import { WardEngine, ghostRun } from '@ghost-run/core';
import { parseWards } from '@ghost-run/wards-config';
import config from '../world.config.js';
import type { Action } from '../src/world.js';

const parsed = parseWards(readFileSync(new URL('../wards.yaml', import.meta.url), 'utf8'));
if (!parsed.ok) throw new Error('wards.yaml does not parse');
const { wardSet } = parsed;

/** Runs one plan on a fresh world and returns the printed lines. Never changes the real list. */
export async function runPlan(label: string, plan: readonly Action[]): Promise<string[]> {
  const world = config.create();
  const before = await world.fingerprint();
  const report = await ghostRun(world, await world.snapshot(), plan);
  const after = await world.fingerprint();
  const verdict = WardEngine.evaluate(report, wardSet);
  const lost = report.changes.flat().filter((c) => c.kind === 'file-deleted').length;
  const out = [`plan: ${label}`];
  if (verdict.verdict === 'block') {
    const ward = verdict.violations[0]?.wardId ?? 'unknown';
    out.push(`  blocked by ward ${ward}: the copy lost ${lost} to-dos`);
    out.push(`  real list unchanged: ${before.hash === after.hash} (fingerprint ${before.hash.slice(0, 12)} before and after)`);
  } else {
    out.push(`  ${verdict.verdict === 'pass' ? 'passed' : verdict.verdict}: ${plan.length} action, the copy lost ${lost} to-dos`);
  }
  return out;
}

export async function runDemo(): Promise<string> {
  const lines = [
    ...(await runPlan('clear', [{ kind: 'clear' }])),
    ...(await runPlan('add "buy candles"', [{ kind: 'add', text: 'buy candles' }])),
  ];
  return lines.join('\n');
}
