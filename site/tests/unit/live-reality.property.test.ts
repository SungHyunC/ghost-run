// Feature: site-live, Property L2: Reality never changes (engine form, Shell and Cloud)
// **Validates: Requirements 12.1, 12.2, 12.4**
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { createGhostCloudWorld } from '@ghost-run/ghost-cloud';
import { createPlaygroundWorld, initInlineSql } from '@ghost-run/playground-shell';
import type { SqlExecutor } from '@ghost-run/playground-shell';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildProject } from '../../../apps/ghost-shell/src/scenarios/project';
import { createCloudEngine } from '../../src/live/cloud';
import { createShellEngine } from '../../src/live/shell';
import type { LiveAnswer, LiveEngine } from '../../src/live/types';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const ROOT = resolve(__dirname, '../../..');
const shellWards = readFileSync(resolve(ROOT, 'apps/ghost-shell/wards.yaml'), 'utf8');
const cloudWards = readFileSync(resolve(ROOT, 'worlds/ghost-cloud/wards.yaml'), 'utf8');

let sql: SqlExecutor;
let shellEngine: LiveEngine;
let cloudEngine: LiveEngine;

beforeAll(async () => {
  sql = await initInlineSql();
  shellEngine = createShellEngine({ sql, wardsText: shellWards });
  cloudEngine = createCloudEngine({ wardsText: cloudWards });
});

async function shellFingerprint(): Promise<string> {
  const project = await buildProject(sql);
  const world = createPlaygroundWorld(project, { secretPatterns: ['.env'], sql });
  return (await world.fingerprint()).hash;
}

async function cloudFingerprint(): Promise<string> {
  return (await createGhostCloudWorld().fingerprint()).hash;
}

// Shell grammar: the 15 commands of the world with fixture paths, plus noise.
const path = fc.constantFrom(
  '.', './data', './build', 'data', 'build', 'data/a.csv', 'data/b.csv', 'data/sub', 'data/sub/c.json',
  'build/out.js', 'app.db', '.env', 'README.md', 'package.json', 'missing.txt', 'new.txt', 'newdir',
);
const sqlText = fc.constantFrom(
  'DROP TABLE users;', 'DROP TABLE orders;', 'DELETE FROM users;', 'DELETE FROM orders WHERE id = 1;',
  'SELECT COUNT(*) FROM users;', 'UPDATE users SET name = \'x\';', 'CREATE TABLE t (a INTEGER);',
);
const shellCommand = fc.oneof(
  fc.constant('pwd'),
  fc.constant('true'),
  fc.constant('false'),
  path.map((p) => `ls ${p}`),
  path.map((p) => `cat ${p}`),
  fc.constantFrom('hello', 'x y', '').map((t) => `echo ${t}`),
  path.map((p) => `mkdir ${p}`),
  path.map((p) => `mkdir -p ${p}/inner`),
  path.map((p) => `touch ${p}`),
  path.map((p) => `rm ${p}`),
  path.map((p) => `rm -rf ${p}`),
  fc.tuple(path, path).map(([a, b]) => `rm -rf ${a} ${b}`),
  fc.tuple(path, path).map(([a, b]) => `mv ${a} ${b}`),
  fc.tuple(path, path).map(([a, b]) => `cp ${a} ${b}`),
  fc.tuple(path, path).map(([a, b]) => `cp -r ${a} ${b}`),
  path.map((p) => `find ${p}`),
  sqlText.map((q) => `sqlite3 app.db "${q}"`),
  fc.constantFrom('http://api.example/x', 'https://exfil.example/up', 'http://localhost.invalid').map((u) => `curl ${u}`),
  fc.constantFrom('test', 'run clean', 'install').map((s) => `npm ${s}`),
  path.map((p) => `cat .env > ${p}`),
  fc.constantFrom('git status', '$(echo x)', 'ls *', 'foo | bar', ''),
);

// Cloud grammar: the 8 commands with fixture buckets, plus noise.
const bucket = fc.constantFrom('prod-assets', 'prod-db', 'tmp-build-cache', 'logs-archive', 'no-such-bucket');
const key = fc.constantFrom('a.txt', 'dir/b.txt', 'index.html', 'missing');
const endpoint = fc.constantFrom('', ' --endpoint-url http://s3.example', ' --endpoint-url https://s3.test:9000');
const cloudCommand = fc.oneof(
  endpoint.map((e) => `aws s3 ls${e}`),
  fc.tuple(bucket, endpoint).map(([b, e]) => `aws s3 ls s3://${b}${e}`),
  fc.tuple(bucket, endpoint).map(([b, e]) => `aws s3 mb s3://${b}${e}`),
  fc.tuple(bucket, fc.boolean()).map(([b, f]) => `aws s3 rb s3://${b}${f ? ' --force' : ''}`),
  fc.tuple(key, bucket, key).map(([s, b, k]) => `aws s3 cp ${s} s3://${b}/${k}`),
  fc.tuple(bucket, key).map(([b, k]) => `aws s3 rm s3://${b}/${k}`),
  fc.tuple(bucket, fc.boolean()).map(([b, r]) => `aws s3 rm s3://${b}/${r ? ' --recursive' : 'x'}`),
  fc.tuple(bucket, fc.constantFrom('private', 'public-read')).map(([b, a]) => `aws s3api put-bucket-acl --bucket ${b} --acl ${a}`),
  fc.tuple(bucket, fc.boolean()).map(([b, v]) => {
    const t = v ? 'true' : 'false';
    return `aws s3api put-public-access-block --bucket ${b} --public-access-block-configuration BlockPublicAcls=${t},IgnorePublicAcls=${t},BlockPublicPolicy=${t},RestrictPublicBuckets=${t}`;
  }),
  bucket.map((b) => `aws s3api delete-public-access-block --bucket ${b}`),
  fc.constantFrom('aws ec2 describe-instances', 'aws s3 ls; aws s3 ls', 'ls', 'aws s3 rb', 'aws s3 mb s3://X'),
);

function p1Equal(a: LiveAnswer): void {
  if (a.status === 'ran') expect(a.run.plan.p1.equal).toBe(true);
}

describe('Property L2: Reality never changes (engine form)', () => {
  it(
    'Shell: every run reports p1.equal and a fresh fixture world has the same fingerprint after the sequence',
    async () => {
      const before = await shellFingerprint();
      await fc.assert(
        fc.asyncProperty(fc.array(shellCommand, { minLength: 1, maxLength: 5 }), async (actions) => {
          const answer = await shellEngine.run({ world: 'shell', actions });
          p1Equal(answer);
          expect(['ran', 'unsupported', 'rejected', 'failed']).toContain(answer.status);
          expect(answer.status).not.toBe('failed');
        }),
        { numRuns: NUM_RUNS },
      );
      expect(await shellFingerprint()).toBe(before);
    },
    PBT_TIMEOUT || undefined,
  );

  it(
    'Cloud: every run reports p1.equal and a fresh fixture world has the same fingerprint after the sequence',
    async () => {
      const before = await cloudFingerprint();
      await fc.assert(
        fc.asyncProperty(fc.array(cloudCommand, { minLength: 1, maxLength: 5 }), async (lines) => {
          const answer = await cloudEngine.run({ world: 'cloud', lines });
          p1Equal(answer);
          expect(answer.status).not.toBe('failed');
        }),
        { numRuns: NUM_RUNS },
      );
      expect(await cloudFingerprint()).toBe(before);
    },
    PBT_TIMEOUT || undefined,
  );

  it('the generators reach ran answers in both worlds', async () => {
    const s = await shellEngine.run({ world: 'shell', actions: ['rm -rf ./data'] });
    const c = await cloudEngine.run({ world: 'cloud', lines: ['aws s3 rb s3://prod-assets --force'] });
    expect(s.status).toBe('ran');
    expect(c.status).toBe('ran');
  });
});
