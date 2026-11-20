import * as fc from 'fast-check';
import type { Action } from '../../src/types.js';

export const BUCKET_POOL = ['prod-assets', 'prod-logs', 'tmp-build-cache', 'prod-new-b', 'tmp-new-a'] as const;
export const KEY_POOL = ['index.html', 'img/logo.txt', 'a.txt', 'b/c.txt', '2026/01/app.log'] as const;
export const PREFIX_POOL = ['', 'img/', 'b', '2026/'] as const;
export const LOCAL_POOL = ['local/notes.txt', 'local/report.txt', 'local/data.csv'] as const;
export const ENDPOINT_POOL = ['http://s3.example', 'http://s3.example:4566', 'https://store.test'] as const;

const bucketArb = fc.constantFrom(...BUCKET_POOL);
const keyArb = fc.constantFrom(...KEY_POOL);
const prefixArb = fc.constantFrom(...PREFIX_POOL);

const lsArb: fc.Arbitrary<Action> = fc.oneof(
  fc.constant<Action>({ kind: 'ls' }),
  fc.tuple(bucketArb, prefixArb).map(([bucket, prefix]): Action =>
    prefix === '' ? { kind: 'ls', bucket } : { kind: 'ls', bucket, prefix }),
);

const cpArb: fc.Arbitrary<Action> = fc.oneof(
  fc.tuple(bucketArb, keyArb, fc.constantFrom(...LOCAL_POOL)).map(([bucket, key, source]): Action => ({ kind: 'cp', bucket, key, source })),
  fc.tuple(bucketArb, keyArb, bucketArb, keyArb).map(([bucket, key, fromBucket, fromKey]): Action => ({ kind: 'cp', bucket, key, fromBucket, fromKey })),
);

const rmArb: fc.Arbitrary<Action> = fc.oneof(
  fc.tuple(bucketArb, keyArb).map(([bucket, key]): Action => ({ kind: 'rm', bucket, key, recursive: false })),
  fc.tuple(bucketArb, prefixArb).map(([bucket, key]): Action => ({ kind: 'rm', bucket, key, recursive: true })),
);

const bareActionArb: fc.Arbitrary<Action> = fc.oneof(
  { weight: 1, arbitrary: lsArb },
  { weight: 2, arbitrary: bucketArb.map((bucket): Action => ({ kind: 'mb', bucket })) },
  { weight: 4, arbitrary: fc.tuple(bucketArb, fc.boolean()).map(([bucket, force]): Action => ({ kind: 'rb', bucket, force })) },
  { weight: 4, arbitrary: cpArb },
  { weight: 4, arbitrary: rmArb },
  { weight: 3, arbitrary: fc.tuple(bucketArb, fc.constantFrom('private', 'public-read' as const)).map(([bucket, acl]): Action => ({ kind: 'put-bucket-acl', bucket, acl })) },
  { weight: 3, arbitrary: fc.tuple(bucketArb, fc.boolean()).map(([bucket, blocked]): Action => ({ kind: 'put-public-access-block', bucket, blocked })) },
  { weight: 3, arbitrary: bucketArb.map((bucket): Action => ({ kind: 'delete-public-access-block', bucket })) },
);

/** Valid actions of every kind except `unsupported`. About one in eight carries `endpointUrl`. */
export const actionArb: fc.Arbitrary<Action> = fc
  .tuple(bareActionArb, fc.option(fc.constantFrom(...ENDPOINT_POOL), { freq: 8, nil: undefined }))
  .map(([a, e]): Action => (e === undefined || a.kind === 'unsupported' ? a : { ...a, endpointUrl: e }));
