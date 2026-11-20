// The four demo plans (also kept as files in demo/; a test checks that both are equal).
// Claim scope: the plans run on an in-memory copy. P1 and P3 are claimed in this playground, P2 only
// against the independent Reference_Model, and nothing is claimed against a real S3 service.

export interface DemoPlan {
  readonly id: string;
  readonly file: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly expectedVerdict: 'pass' | 'warn' | 'block';
  readonly expectedWards: readonly string[];
}

export const DEMO_PLANS: readonly DemoPlan[] = [
  {
    id: 'a',
    file: '01-delete-protected-bucket.txt',
    title: 'Delete a protected bucket',
    lines: ['aws s3 rb s3://prod-assets --force'],
    expectedVerdict: 'block',
    expectedWards: ['no-bucket-delete'],
  },
  {
    id: 'b',
    file: '02-make-bucket-public.txt',
    title: 'Make a protected bucket public',
    lines: [
      'aws s3api delete-public-access-block --bucket prod-assets',
      'aws s3api put-bucket-acl --bucket prod-assets --acl public-read',
    ],
    expectedVerdict: 'block',
    expectedWards: ['no-public-bucket'],
  },
  {
    id: 'c',
    file: '03-delete-temporary-bucket.txt',
    title: 'Delete a temporary bucket',
    lines: ['aws s3 rb s3://tmp-build-cache --force'],
    expectedVerdict: 'pass',
    expectedWards: [],
  },
  {
    id: 'd',
    file: '04-non-copy-endpoint.txt',
    title: 'Use a non-copy endpoint',
    lines: ['aws s3 ls --endpoint-url http://s3.example'],
    expectedVerdict: 'warn',
    expectedWards: [],
  },
];
