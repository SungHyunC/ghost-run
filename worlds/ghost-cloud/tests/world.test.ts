import { describe, expect, it } from 'vitest';
import { createGhostCloudWorld } from '../src/world.js';
import { createFixture } from '../src/fixture.js';
import { parseLine } from '../src/parse.js';
import config from '../world.config.js';

async function run(lines: readonly string[]) {
  const world = createGhostCloudWorld();
  let cur = await world.snapshot();
  const steps: { changes: ReturnType<typeof world.diff>; ok: boolean; error?: string }[] = [];
  for (const line of lines) {
    const next = await world.step(cur, parseLine(line));
    steps.push({
      changes: world.diff(cur, next),
      ok: next.result.success,
      ...(next.result.success ? {} : { error: next.result.error }),
    });
    cur = next;
  }
  return { world, cur, steps };
}

describe('world: one test per action kind', () => {
  it('ls changes nothing', async () => {
    const { steps } = await run(['aws s3 ls', 'aws s3 ls s3://prod-assets/img/']);
    expect(steps.map((s) => s.ok)).toEqual([true, true]);
    expect(steps.every((s) => s.changes.length === 0)).toBe(true);
  });

  it('mb creates the bucket path only', async () => {
    const { steps } = await run(['aws s3 mb s3://new-bucket']);
    expect(steps[0]?.changes).toEqual([{ kind: 'file-created', path: 'new-bucket' }]);
  });

  it('rb --force deletes the bucket and its objects, no attribute paths', async () => {
    const { steps } = await run(['aws s3 rb s3://prod-logs --force']);
    expect(steps[0]?.changes).toEqual([
      { kind: 'file-deleted', path: 'prod-logs' },
      { kind: 'file-deleted', path: 'prod-logs/2026/01/app.log' },
      { kind: 'file-deleted', path: 'prod-logs/2026/02/app.log' },
    ]);
  });

  it('cp from a local file creates an object, and a second copy overwrites it', async () => {
    const { steps } = await run([
      'aws s3 cp local/notes.txt s3://tmp-build-cache/n.txt',
      'aws s3 cp local/report.txt s3://tmp-build-cache/n.txt',
      'aws s3 cp local/report.txt s3://tmp-build-cache/n.txt',
    ]);
    expect(steps[0]?.changes).toEqual([{ kind: 'file-created', path: 'tmp-build-cache/n.txt' }]);
    expect(steps[1]?.changes).toEqual([{ kind: 'file-overwritten', path: 'tmp-build-cache/n.txt' }]);
    expect(steps[2]?.changes).toEqual([]);
  });

  it('cp between buckets copies content', async () => {
    const { cur } = await run(['aws s3 cp s3://prod-assets/index.html s3://tmp-build-cache/i.html']);
    const t = cur.state.buckets.find((b) => b.name === 'tmp-build-cache');
    const p = cur.state.buckets.find((b) => b.name === 'prod-assets');
    expect(t?.objects.find((o) => o.key === 'i.html')?.content).toBe(p?.objects.find((o) => o.key === 'index.html')?.content);
  });

  it('rm removes one object; recursive rm removes by prefix', async () => {
    const { steps, cur } = await run([
      'aws s3 rm s3://prod-assets/index.html',
      'aws s3 rm s3://prod-assets/img/ --recursive',
    ]);
    expect(steps[0]?.changes).toEqual([{ kind: 'file-deleted', path: 'prod-assets/index.html' }]);
    expect(steps[1]?.changes).toEqual([{ kind: 'file-deleted', path: 'prod-assets/img/logo.txt' }]);
    expect(cur.state.buckets[0]?.objects.map((o) => o.key)).toEqual(['css/site.css']);
  });

  it('rm of a missing object succeeds with no change', async () => {
    const { steps } = await run(['aws s3 rm s3://prod-assets/nope.txt']);
    expect(steps[0]).toEqual({ changes: [], ok: true });
  });

  it('put-bucket-acl gives one file-overwritten on _acl/BUCKET', async () => {
    const { steps } = await run(['aws s3api put-bucket-acl --bucket prod-assets --acl public-read', 'aws s3api put-bucket-acl --bucket prod-assets --acl public-read']);
    expect(steps[0]?.changes).toEqual([{ kind: 'file-overwritten', path: '_acl/prod-assets' }]);
    expect(steps[1]?.changes).toEqual([]);
  });

  it('delete-public-access-block and put-public-access-block change the block path', async () => {
    const off = 'aws s3api put-public-access-block --bucket prod-logs --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true';
    const on = 'aws s3api put-public-access-block --bucket prod-logs --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true';
    const { steps } = await run(['aws s3api delete-public-access-block --bucket prod-assets', off, on, on]);
    expect(steps[0]?.changes).toEqual([{ kind: 'file-deleted', path: '_public-access-block/prod-assets' }]);
    expect(steps[1]?.changes).toEqual([{ kind: 'file-deleted', path: '_public-access-block/prod-logs' }]);
    expect(steps[2]?.changes).toEqual([{ kind: 'file-created', path: '_public-access-block/prod-logs' }]);
    expect(steps[3]?.changes).toEqual([]);
  });
});

describe('world: invalid actions return the state unchanged', () => {
  const cases: [string, string][] = [
    ['aws s3 ls s3://missing-bucket', 'bucket does not exist'],
    ['aws s3 mb s3://prod-assets', 'bucket already exists'],
    ['aws s3 rb s3://missing-bucket', 'bucket does not exist'],
    ['aws s3 rb s3://prod-assets', 'bucket is not empty'],
    ['aws s3 cp local/missing.txt s3://prod-assets/a.txt', 'local file does not exist'],
    ['aws s3 cp local/notes.txt s3://missing-bucket/a.txt', 'bucket does not exist'],
    ['aws s3 cp s3://prod-assets/nope s3://prod-logs/a.txt', 'object does not exist'],
    ['aws s3 rm s3://missing-bucket/a.txt', 'bucket does not exist'],
    ['aws s3api put-bucket-acl --bucket missing-bucket --acl private', 'bucket does not exist'],
    ['aws s3api delete-public-access-block --bucket missing-bucket', 'bucket does not exist'],
  ];
  for (const [line, text] of cases) {
    it(`${line}`, async () => {
      const { cur, steps } = await run([line]);
      expect(steps[0]?.ok).toBe(false);
      expect(steps[0]?.error).toContain(text);
      expect(steps[0]?.changes).toEqual([]);
      expect(cur.state).toEqual(createFixture());
    });
  }

  it('rejects invalid keys given directly as actions', async () => {
    const world = createGhostCloudWorld();
    const s = await world.snapshot();
    for (const key of ['', '/abs', 'a//b', 'a/../b', '..']) {
      const r = await world.step(s, { kind: 'cp', bucket: 'prod-assets', key, source: 'local/notes.txt' });
      expect(r.result.success).toBe(false);
      expect(r.state).toEqual(s.state);
    }
  });

  it('an unsupported step fails with a text that starts with "unsupported step"', async () => {
    const { steps, cur } = await run(['aws ec2 describe-instances']);
    expect(steps[0]?.ok).toBe(false);
    expect(steps[0]?.error?.startsWith('unsupported step')).toBe(true);
    expect(cur.state).toEqual(createFixture());
  });
});

describe('world: attribute rule', () => {
  it('deleting and creating a bucket gives changes for the bucket and objects only', async () => {
    const { steps } = await run(['aws s3 rb s3://tmp-build-cache --force', 'aws s3 mb s3://tmp-build-cache']);
    expect(steps[0]?.changes.map((c) => c.path)).toEqual(['tmp-build-cache', 'tmp-build-cache/cache/a.txt', 'tmp-build-cache/cache/b.txt']);
    expect(steps[1]?.changes).toEqual([{ kind: 'file-created', path: 'tmp-build-cache' }]);
  });
});

describe('world: step, snapshot, fingerprint, effects, render', () => {
  it('step does not mutate the input snapshot and snapshot does not touch Reality', async () => {
    const world = createGhostCloudWorld();
    const fp1 = await world.fingerprint();
    const s = await world.snapshot();
    const copy = structuredClone(s);
    await world.step(s, parseLine('aws s3 rb s3://prod-assets --force'));
    expect(s).toEqual(copy);
    expect((await world.fingerprint()).hash).toBe(fp1.hash);
  });

  it('fingerprint manifest has the attribute paths', async () => {
    const fp = await createGhostCloudWorld().fingerprint();
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(fp.manifest)).toContain('_acl/prod-assets');
    expect(Object.keys(fp.manifest)).toContain('_public-access-block/prod-assets');
  });

  it('effectsOutside is a network effect only for --endpoint-url', () => {
    const world = createGhostCloudWorld();
    expect(world.effectsOutside(parseLine('aws s3 ls --endpoint-url http://s3.example'))).toEqual([{ kind: 'network', destination: 's3.example' }]);
    expect(world.effectsOutside(parseLine('aws s3 ls --endpoint-url https://store.test:4566/x'))).toEqual([{ kind: 'network', destination: 'store.test' }]);
    expect(world.effectsOutside(parseLine('aws s3 ls'))).toEqual([]);
    expect(world.effectsOutside(parseLine('aws ec2 x'))).toEqual([]);
  });

  it('render lists buckets in order and survives a JSON round trip', async () => {
    const world = createGhostCloudWorld();
    const scene = world.render(await world.snapshot());
    expect(JSON.parse(JSON.stringify(scene))).toEqual(scene);
    expect((scene['buckets'] as { name: string }[]).map((b) => b.name)).toEqual(['prod-assets', 'prod-logs', 'tmp-build-cache']);
  });

  it('create() needs no I/O', () => {
    expect(config.id).toBe('ghost-cloud');
    expect(() => config.create()).not.toThrow();
  });
});
