// Env-gated measurement of the recorded runs (skipped unless GHOST_SITE_RUNS_OUT is set). Run it through
// scripts/record-runs.mjs. It builds the three live adapters with in-process services, runs every Preset
// and every Fixed_Plan, and writes the Runs_File (version 2) text to GHOST_SITE_RUNS_OUT.
// It reads no clock, no random source, and no network. It never reads the shell fixture's .env.
/// <reference path="../../worlds/playground-shell/src/sql-js.d.ts" />
import { readFileSync, writeFileSync } from 'node:fs';
import { createGhostHandWorld } from '@ghost-run/drawer-arm';
import { initInlineSql } from '@ghost-run/playground-shell';
import { describe, expect, it } from 'vitest';
import type { PlanRecord, PresetRecord, RunsFile, WorldId, WorldRecordV2 } from '../src/data/types';
import { createCloudEngine } from '../src/live/cloud';
import { createHandEngine, createHandInlineExecutor, handCapabilities } from '../src/live/hand';
import { FIXED, PRESETS } from '../src/live/presets';
import { createShellEngine } from '../src/live/shell';
import type { LiveEngine, LiveInput, LiveRun } from '../src/live/types';
import { validateRecords } from './lib/validate-records';

const OUT = process.env['GHOST_SITE_RUNS_OUT'];

const repo = new URL('../../', import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, repo), 'utf8');

/** A recorded run must have run: any other answer ends the script without a file. */
async function ran(engine: LiveEngine, label: string, input: LiveInput): Promise<LiveRun> {
  const answer = await engine.run(input);
  if (answer.status !== 'ran') throw new Error(`${label}: expected a run, got ${JSON.stringify(answer)}`);
  return answer.run;
}

async function recordWorld(world: WorldId, engine: LiveEngine): Promise<WorldRecordV2> {
  let ward: LiveRun['ward'] | undefined;
  let reality: LiveRun['reality'] | undefined;
  const presets: PresetRecord[] = [];

  const take = (label: string, run: LiveRun): PlanRecord => {
    // One ward card and one Reality pane per world: every run must agree on them.
    if (ward === undefined || reality === undefined) {
      ward = run.ward;
      reality = run.reality;
    } else if (JSON.stringify(ward) !== JSON.stringify(run.ward) || JSON.stringify(reality) !== JSON.stringify(run.reality)) {
      throw new Error(`${label}: the ward or the reality scene differs from the first run of ${world}`);
    }
    return run.plan;
  };

  for (const preset of PRESETS[world]) {
    const plan = take(preset.id, await ran(engine, preset.id, preset.input));
    const fixInput = FIXED[preset.id];
    const fixed = fixInput === undefined ? null : take(`${preset.id} fixed`, await ran(engine, `${preset.id} fixed`, fixInput));
    presets.push({ id: preset.id, plan, fixed });
  }
  if (ward === undefined || reality === undefined) throw new Error(`${world}: no run`);
  return { id: world, ward, reality, presets };
}

describe.skipIf(OUT === undefined)('record-runs', () => {
  it('records every Preset and every Fixed_Plan', async () => {
    const shellEngine = createShellEngine({ sql: await initInlineSql(), wardsText: read('apps/ghost-shell/wards.yaml') });
    const cloudEngine = createCloudEngine({ wardsText: read('worlds/ghost-cloud/wards.yaml') });
    const handEngine = createHandEngine({
      createWorld: (options) => createGhostHandWorld(options),
      createExecutor: () => createHandInlineExecutor(() => createGhostHandWorld()),
      wardsText: read('worlds/drawer-arm/wards.yaml'),
      variantConfigText: read('worlds/drawer-arm/variant-config.json'),
      capabilities: handCapabilities(),
    });
    try {
      const shell = await recordWorld('shell', shellEngine);
      const hand = await recordWorld('hand', handEngine);
      const cloud = await recordWorld('cloud', cloudEngine);
      const file: RunsFile = {
        format: 'ghost-site-runs',
        version: 2,
        seed: 42,
        variantCount: 8,
        worlds: { shell, hand, cloud },
      };
      const problems = validateRecords(file);
      if (problems.length > 0) throw new Error(`record-runs refused:\n${problems.join('\n')}`);
      writeFileSync(OUT as string, JSON.stringify(file));
      expect(file.worlds.hand.presets).toHaveLength(3);
    } finally {
      shellEngine.dispose();
      cloudEngine.dispose();
      handEngine.dispose();
    }
  });
});
