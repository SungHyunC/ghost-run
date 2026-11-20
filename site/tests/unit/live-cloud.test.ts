// Ghost Cloud adapter, run in Node.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGhostCloudWorld } from '@ghost-run/ghost-cloud';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCloudEngine } from '../../src/live/cloud';
import { FIXED, PRESETS } from '../../src/live/presets';
import type { LiveAnswer, LiveEngine, LiveRun } from '../../src/live/types';

const ROOT = resolve(__dirname, '../../..');
const wardsText = readFileSync(resolve(ROOT, 'worlds/ghost-cloud/wards.yaml'), 'utf8');

let engine: LiveEngine;
beforeAll(() => {
  engine = createCloudEngine({ wardsText });
});

const cloud = (...lines: string[]) => engine.run({ world: 'cloud', lines });

function ran(a: LiveAnswer): LiveRun {
  if (a.status !== 'ran') throw new Error(`expected ran, got ${a.status}`);
  return a.run;
}

const preset = (id: string) => {
  const p = PRESETS.cloud.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};

describe('Ghost Cloud adapter', () => {
  it('blocks delete prod-assets by no-bucket-delete and the fixed plan passes', async () => {
    const p = preset('cloud-delete-prod');
    const run = ran(await engine.run(p.input));
    expect(run.plan.verdict).toBe('block');
    expect(run.plan.violatedWardIds).toEqual(['no-bucket-delete']);
    expect(run.plan.checks).toEqual([{ label: 'never delete prod-*', measured: 'prod-assets deleted', ok: false }]);
    expect(run.plan.facts).toEqual({ bucketsRemoved: 1, objectsRemoved: 3, removedBuckets: 'prod-assets' });
    expect(run.plan.p1.equal).toBe(true);
    expect(run.ward).toEqual({ id: 'no-bucket-delete', kind: 'path', line: 'kind: path \u00B7 deny delete on prod-*' });
    const fixed = FIXED['cloud-delete-prod'];
    if (!fixed) throw new Error('fixed');
    expect(ran(await engine.run(fixed)).plan.verdict).toBe('pass');
  });

  it('passes delete tmp-build-cache', async () => {
    const run = ran(await engine.run(preset('cloud-delete-tmp').input));
    expect(run.plan.verdict).toBe('pass');
    expect(run.plan.checks[0]).toMatchObject({ measured: 'tmp-build-cache is not prod-*', ok: true });
    expect(run.plan.facts).toMatchObject({ bucketsRemoved: 1, objectsRemoved: 2 });
  });

  it('blocks make it public by no-public-bucket with the extra chip and the tag', async () => {
    const run = ran(await engine.run(preset('cloud-make-public').input));
    expect(run.plan.verdict).toBe('block');
    expect(run.plan.violatedWardIds).toEqual(['no-public-bucket']);
    expect(run.plan.checks).toHaveLength(2);
    expect(run.plan.checks[0]).toMatchObject({ ok: true });
    expect(run.plan.checks[1]).toMatchObject({ label: 'no-public-bucket', ok: false });
    const copy = run.plan.copyAfter;
    expect(copy.kind).toBe('cloud');
    if (copy.kind === 'cloud') {
      expect(copy.buckets.find((b) => b.name === 'prod-assets')?.tag).toBe('acl: public-read');
      expect(copy.buckets.find((b) => b.name === 'prod-logs')?.tag).toBeUndefined();
    }
    expect(run.plan.p1.equal).toBe(true);
  });

  it('warns on --endpoint-url and names the destination', async () => {
    const run = ran(await cloud('aws s3 ls --endpoint-url http://s3.example'));
    expect(run.plan.verdict).toBe('warn');
    expect(run.plan.effectsOutside.join(' ')).toContain('s3.example');
  });

  it('answers unsupported with a fixed reason and no echo of the input', async () => {
    for (const line of ['aws ec2 describe-instances SECRETWORD', 'aws s3 ls; echo SECRETWORD']) {
      const a = await cloud(line);
      expect(a.status).toBe('unsupported');
      if (a.status === 'unsupported') {
        expect(a.reason).not.toContain('SECRETWORD');
        expect(a.reason).not.toContain('ec2');
        expect(a.stepIndexes).toEqual([0]);
      }
    }
    const semi = await cloud('aws s3 ls; ls');
    expect(semi).toMatchObject({ status: 'unsupported', reason: 'shell operator' });
    const ec2 = await cloud('aws ec2 describe-instances');
    expect(ec2).toMatchObject({ status: 'unsupported', reason: 'unsupported command' });
  });

  it('keeps the engine cut of 50 lines', async () => {
    const run = ran(await cloud(...Array.from({ length: 51 }, () => 'aws s3 ls')));
    expect(run.plan.commands).toHaveLength(50);
    expect(run.plan.verdict).toBe('warn');
  });

  it('rejects an empty plan and fails for a broken wards file', async () => {
    expect(await engine.run({ world: 'cloud', lines: [] })).toEqual({ status: 'rejected', problem: 'empty' });
    const bad = createCloudEngine({ wardsText: 'not: [valid' });
    expect(await bad.run({ world: 'cloud', lines: ['aws s3 ls'] })).toEqual({ status: 'failed', cause: 'internal' });
  });

  it('fails with internal for the internal-error run', async () => {
    const e = createCloudEngine({
      wardsText,
      worldFactory: () => {
        throw new Error('boom');
      },
    });
    expect(await e.run({ world: 'cloud', lines: ['aws s3 ls'] })).toEqual({ status: 'failed', cause: 'internal' });
    const ok = createCloudEngine({ wardsText, worldFactory: () => createGhostCloudWorld() });
    expect((await ok.run({ world: 'cloud', lines: ['aws s3 ls'] })).status).toBe('ran');
  });

  it('lists the buckets in the reality scene', async () => {
    const run = ran(await cloud('aws s3 ls'));
    expect(run.reality.kind).toBe('cloud');
    if (run.reality.kind === 'cloud') {
      expect(run.reality.buckets.map((b) => b.name)).toEqual(['prod-assets', 'prod-logs', 'tmp-build-cache']);
    }
  });
});
