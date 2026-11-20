// Gated test (project `record`, started by `pnpm test:record`): Property L1 for Ghost Hand.
// Feature: site-live, Property L1: Live equals recorded
// The input space is the 3 Hand Presets and the 1 Hand Fixed_Plan; it is finite, so it is enumerated.
// It is gated because it runs the real MuJoCo world. The Shell and Cloud cases are in tests/unit/live-parity.test.ts.
// **Validates: Requirements 11.1, 11.3, 11.4, 11.5, 11.6**
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGhostHandWorld } from '@ghost-run/drawer-arm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInlineExecutor } from '../../../apps/ghost-hand/src/exec/inline';
import type { PlanRecord, RunsFile } from '../../src/data/types';
import { createHandEngine, handCapabilities } from '../../src/live/hand';
import { FIXED, PRESETS } from '../../src/live/presets';
import type { LiveEngine, LiveInput } from '../../src/live/types';
import { expectedRecord } from '../lib/parity';

const SITE_DIR = fileURLToPath(new URL('../../', import.meta.url));
const ROOT = resolve(SITE_DIR, '..');
const COMMITTED = join(SITE_DIR, 'src', 'data', 'runs.json');
const committedText = readFileSync(COMMITTED, 'utf8');
const committed = JSON.parse(committedText) as RunsFile;
const noFresh = (): Promise<RunsFile> => Promise.reject(new Error('the committed file must hold every Preset'));

let engine: LiveEngine;
let tmp = '';
beforeAll(() => {
  tmp = mkdtempSync(join(os.tmpdir(), 'ghost-site-parity-hand-'));
  engine = createHandEngine({
    createWorld: (o) => createGhostHandWorld(o),
    createExecutor: () => createInlineExecutor(() => createGhostHandWorld()),
    wardsText: readFileSync(resolve(ROOT, 'worlds/drawer-arm/wards.yaml'), 'utf8'),
    variantConfigText: readFileSync(resolve(ROOT, 'worlds/drawer-arm/variant-config.json'), 'utf8'),
    capabilities: handCapabilities(),
  });
});
afterAll(() => {
  engine?.dispose();
  if (tmp !== '') rmSync(tmp, { recursive: true, force: true });
});

async function live(input: LiveInput): Promise<PlanRecord> {
  const answer = await engine.run(input);
  if (answer.status !== 'ran') throw new Error(`expected a run, got ${answer.status}`);
  return answer.run.plan;
}

describe('live equals recorded: hand', () => {
  for (const preset of PRESETS.hand) {
    it(`Preset ${preset.id}`, async () => {
      expect(await live(preset.input)).toEqual(await expectedRecord(committed, 'hand', preset.id, 'plan', noFresh));
    });
    const fix = FIXED[preset.id];
    if (fix !== undefined) {
      it(`Fixed_Plan of ${preset.id}`, async () => {
        expect(await live(fix)).toEqual(await expectedRecord(committed, 'hand', preset.id, 'fixed', noFresh));
      });
    }
  }
});

describe('the Record_Script output', () => {
  it('is byte-equal to the committed runs.json when run into a temporary file', () => {
    const out = join(tmp, 'runs.json');
    const r = spawnSync('node', ['scripts/record-runs.mjs', '--out', out], { cwd: SITE_DIR, encoding: 'utf8' });
    if (r.status !== 0 || !existsSync(out)) throw new Error(`record-runs failed (${r.status}): ${r.stdout}\n${r.stderr}`);
    expect(readFileSync(out, 'utf8')).toBe(committedText);
  });
});
