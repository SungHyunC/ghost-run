// Feature: site-live, Property L1: Live equals recorded
// The input space is the 11 Ghost Shell and Ghost Cloud plans (3 + 3 Presets and 3 Fixed_Plans: two Shell, one Cloud).
// It is finite and small, so it is enumerated, not generated. The Ghost Hand cases run in tests/record/live-parity-hand.test.ts.
// **Validates: Requirements 11.1, 11.3, 11.4, 11.5, 11.6**
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { initInlineSql } from '@ghost-run/playground-shell';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlanRecord, RunsFile, WorldId } from '../../src/data/types';
import { createCloudEngine } from '../../src/live/cloud';
import { FIXED, PRESETS } from '../../src/live/presets';
import { createShellEngine } from '../../src/live/shell';
import type { LiveAnswer, LiveEngine, LiveInput, LiveRun } from '../../src/live/types';
import { expectedRecord } from '../lib/parity';

const ROOT = resolve(__dirname, '../../..');
const committed = JSON.parse(readFileSync(resolve(__dirname, '../../src/data/runs.json'), 'utf8')) as RunsFile;
const noFresh = (): Promise<RunsFile> => Promise.reject(new Error('the committed file must hold every Preset'));

const engines: Partial<Record<WorldId, LiveEngine>> = {};
beforeAll(async () => {
  engines.shell = createShellEngine({
    sql: await initInlineSql(),
    wardsText: readFileSync(resolve(ROOT, 'apps/ghost-shell/wards.yaml'), 'utf8'),
  });
  engines.cloud = createCloudEngine({ wardsText: readFileSync(resolve(ROOT, 'worlds/ghost-cloud/wards.yaml'), 'utf8') });
});
afterAll(() => {
  for (const e of Object.values(engines)) e?.dispose();
});

async function live(world: WorldId, input: LiveInput): Promise<PlanRecord> {
  const engine = engines[world];
  if (engine === undefined) throw new Error(`no engine for ${world}`);
  const answer = await engine.run(input);
  if (answer.status !== 'ran') throw new Error(`expected a run, got ${answer.status}`);
  return answer.run.plan;
}

describe.each(['shell', 'cloud'] as const)('live equals recorded: %s', (world) => {
  for (const preset of PRESETS[world]) {
    it(`Preset ${preset.id}`, async () => {
      expect(await live(world, preset.input)).toEqual(await expectedRecord(committed, world, preset.id, 'plan', noFresh));
    });
    const fix = FIXED[preset.id];
    if (fix !== undefined) {
      it(`Fixed_Plan of ${preset.id}`, async () => {
        expect(await live(world, fix)).toEqual(await expectedRecord(committed, world, preset.id, 'fixed', noFresh));
      });
    }
  }

  it('the enumeration covers every Shell and Cloud plan of the committed file', () => {
    const inFile = committed.worlds[world].presets.flatMap((p) => (p.fixed === null ? [p.id] : [p.id, `${p.id}#fixed`]));
    const enumerated = PRESETS[world].flatMap((p) => (FIXED[p.id] === undefined ? [p.id] : [p.id, `${p.id}#fixed`]));
    expect(enumerated).toEqual(inFile);
  });
});

describe('a Preset with no entry in the committed file', () => {
  const run = (plan: PlanRecord): LiveRun => ({
    world: 'cloud',
    ward: { id: 'fixture-ward', kind: 'path', line: 'fixture' },
    reality: { kind: 'cloud', buckets: [] },
    plan,
  });
  const fixturePlan: PlanRecord = {
    commands: ['fixture'],
    display: 'fixture',
    verdict: 'pass',
    violatedWardIds: [],
    checks: [],
    effectsOutside: [],
    p1: { equal: true, before: 'a', after: 'a' },
    copyAfter: { kind: 'cloud', buckets: [] },
    facts: { n: 1 },
    message: '',
  };
  const fixtureEngine: LiveEngine = {
    world: 'cloud',
    warm: () => Promise.resolve(),
    run: (): Promise<LiveAnswer> => Promise.resolve({ status: 'ran', run: run(fixturePlan) }),
    dispose: () => undefined,
  };
  let tmp = '';
  beforeAll(() => {
    tmp = mkdtempSync(join(os.tmpdir(), 'ghost-site-parity-'));
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('is compared with a fresh recording written to a temporary file', async () => {
    // The committed file lacks the Preset `cloud-fixture`; the fresh recording (fixture engine, temporary file) holds it.
    const without: RunsFile = structuredClone(committed);
    let recordings = 0;
    const fresh = async (): Promise<RunsFile> => {
      recordings += 1;
      const out = join(tmp, 'runs.json');
      const file = structuredClone(committed);
      const answer = await fixtureEngine.run({ world: 'cloud', lines: ['x'] });
      if (answer.status !== 'ran') throw new Error('fixture engine must run');
      file.worlds.cloud.presets.push({ id: 'cloud-fixture', plan: answer.run.plan, fixed: null });
      writeFileSync(out, JSON.stringify(file));
      return JSON.parse(readFileSync(out, 'utf8')) as RunsFile;
    };
    const expected = await expectedRecord(without, 'cloud', 'cloud-fixture', 'plan', fresh);
    expect(recordings).toBe(1);
    const answer = await fixtureEngine.run({ world: 'cloud', lines: ['x'] });
    if (answer.status !== 'ran') throw new Error('fixture engine must run');
    expect(answer.run.plan).toEqual(expected);
  });

  it('does not make a fresh recording when the committed file has the entry', async () => {
    let recordings = 0;
    const id = PRESETS.cloud[0]?.id ?? '';
    await expectedRecord(committed, 'cloud', id, 'plan', () => {
      recordings += 1;
      return Promise.resolve(committed);
    });
    expect(recordings).toBe(0);
  });
});
