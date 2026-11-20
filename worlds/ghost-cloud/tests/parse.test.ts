import { describe, expect, it } from 'vitest';
import { parseLine } from '../src/parse.js';

const BLOCK_ALL = 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true';

describe('parseLine: valid lines', () => {
  it('parses ls without and with a bucket and prefix', () => {
    expect(parseLine('aws s3 ls')).toEqual({ kind: 'ls' });
    expect(parseLine('aws s3 ls s3://prod-assets')).toEqual({ kind: 'ls', bucket: 'prod-assets' });
    expect(parseLine('aws s3 ls s3://prod-assets/img/')).toEqual({ kind: 'ls', bucket: 'prod-assets', prefix: 'img/' });
  });

  it('parses mb, rb, and rb --force in any option order', () => {
    expect(parseLine('aws s3 mb s3://new-bucket')).toEqual({ kind: 'mb', bucket: 'new-bucket' });
    expect(parseLine('aws s3 rb s3://tmp-build-cache')).toEqual({ kind: 'rb', bucket: 'tmp-build-cache', force: false });
    expect(parseLine('aws s3 rb s3://prod-assets --force')).toEqual({ kind: 'rb', bucket: 'prod-assets', force: true });
    expect(parseLine('aws s3 rb --force s3://prod-assets')).toEqual({ kind: 'rb', bucket: 'prod-assets', force: true });
  });

  it('parses cp from a local file and between buckets', () => {
    expect(parseLine('aws s3 cp local/notes.txt s3://tmp-build-cache/a.txt')).toEqual({
      kind: 'cp', bucket: 'tmp-build-cache', key: 'a.txt', source: 'local/notes.txt',
    });
    expect(parseLine('aws s3 cp s3://prod-assets/index.html s3://tmp-build-cache/x/y.html')).toEqual({
      kind: 'cp', bucket: 'tmp-build-cache', key: 'x/y.html', fromBucket: 'prod-assets', fromKey: 'index.html',
    });
  });

  it('parses rm and rm --recursive', () => {
    expect(parseLine('aws s3 rm s3://prod-assets/index.html')).toEqual({ kind: 'rm', bucket: 'prod-assets', key: 'index.html', recursive: false });
    expect(parseLine('aws s3 rm s3://prod-assets/img/ --recursive')).toEqual({ kind: 'rm', bucket: 'prod-assets', key: 'img/', recursive: true });
    expect(parseLine('aws s3 rm s3://prod-assets --recursive')).toEqual({ kind: 'rm', bucket: 'prod-assets', key: '', recursive: true });
  });

  it('parses the s3api forms', () => {
    expect(parseLine('aws s3api put-bucket-acl --bucket prod-assets --acl public-read')).toEqual({ kind: 'put-bucket-acl', bucket: 'prod-assets', acl: 'public-read' });
    expect(parseLine('aws s3api put-bucket-acl --acl private --bucket prod-assets')).toEqual({ kind: 'put-bucket-acl', bucket: 'prod-assets', acl: 'private' });
    expect(parseLine(`aws s3api put-public-access-block --bucket prod-logs --public-access-block-configuration ${BLOCK_ALL}`)).toEqual({ kind: 'put-public-access-block', bucket: 'prod-logs', blocked: true });
    expect(parseLine('aws s3api put-public-access-block --bucket prod-logs --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true')).toEqual({ kind: 'put-public-access-block', bucket: 'prod-logs', blocked: false });
    expect(parseLine('aws s3api delete-public-access-block --bucket prod-assets')).toEqual({ kind: 'delete-public-access-block', bucket: 'prod-assets' });
  });

  it('parses --endpoint-url on every form', () => {
    expect(parseLine('aws s3 ls --endpoint-url http://s3.example')).toEqual({ kind: 'ls', endpointUrl: 'http://s3.example' });
    expect(parseLine('aws s3 --endpoint-url http://s3.example ls')).toMatchObject({ kind: 'unsupported' });
    expect(parseLine('aws s3 rb s3://tmp-build-cache --endpoint-url https://store.test:4566 --force')).toEqual({
      kind: 'rb', bucket: 'tmp-build-cache', force: true, endpointUrl: 'https://store.test:4566',
    });
    expect(parseLine('aws s3api delete-public-access-block --bucket prod-assets --endpoint-url http://s3.example')).toEqual({
      kind: 'delete-public-access-block', bucket: 'prod-assets', endpointUrl: 'http://s3.example',
    });
  });
});

describe('parseLine: rejected lines', () => {
  const reason = (line: string): string => {
    const a = parseLine(line);
    if (a.kind !== 'unsupported') throw new Error(`expected unsupported: ${line}`);
    return a.reason;
  };

  it('rejects a line that is too long', () => {
    expect(reason(`aws s3 ls s3://${'a'.repeat(1100)}`)).toBe('line is too long');
  });

  it('rejects hidden characters, tabs, and non-ASCII text, and shows an escape', () => {
    const hidden = `aws s3 ls\u200B`;
    const a = parseLine(hidden);
    expect(a).toMatchObject({ kind: 'unsupported', reason: 'line has a character outside printable ASCII' });
    expect(JSON.stringify(a)).not.toContain('\u200B');
    expect(reason('aws s3 ls\ts3://prod-assets')).toContain('outside printable ASCII');
    expect(reason('aws s3 ls s3://caf\u00e9')).toContain('outside printable ASCII');
  });

  it('rejects shell operators', () => {
    for (const op of [';', '|', '&', '`', '$(', '>', '<']) {
      expect(reason(`aws s3 ls s3://prod-assets ${op} x`)).toBe('shell operator');
    }
  });

  it('rejects unknown options, duplicates, and missing arguments', () => {
    expect(reason('aws s3 rb s3://prod-assets --yes')).toBe('malformed command');
    expect(reason('aws s3 rb s3://prod-assets --force --force')).toBe('malformed command');
    expect(reason('aws s3 rb')).toBe('malformed command');
    expect(reason('aws s3 ls --endpoint-url')).toBe('malformed command');
    expect(reason('aws s3api put-bucket-acl --bucket prod-assets')).toBe('malformed command');
    expect(reason('aws s3 rm s3://prod-assets/index.html --force')).toBe('malformed command');
  });

  it('rejects bad bucket names', () => {
    for (const b of ['ab', 'UPPER', 'has_underscore', 'a'.repeat(64)]) {
      expect(reason(`aws s3 mb s3://${b}`)).toBe('malformed argument');
    }
    expect(reason('aws s3api put-bucket-acl --bucket _acl --acl private')).toBe('malformed argument');
  });

  it('rejects bad keys', () => {
    expect(reason('aws s3 rm s3://prod-assets/a//b')).toBe('malformed argument');
    expect(reason('aws s3 rm s3://prod-assets/../x')).toBe('malformed argument');
    expect(reason('aws s3 rm s3://prod-assets/a*b')).toBe('malformed argument');
    expect(reason('aws s3 rm s3://prod-assets/')).toBe('malformed argument');
    expect(reason("aws s3 rm s3://prod-assets/'x'")).toBe('malformed argument');
  });

  it('rejects a local destination for cp and bad local sources', () => {
    expect(reason('aws s3 cp s3://prod-assets/index.html local/out.html')).toBe('unsupported command');
    expect(reason('aws s3 cp local/notes.txt s3://prod-assets')).toBe('unsupported command');
    expect(reason('aws s3 cp ../notes.txt s3://prod-assets/a.txt')).toBe('malformed argument');
    expect(reason('aws s3 cp /etc/x s3://prod-assets/a.txt')).toBe('malformed argument');
  });

  it('rejects bad access block configurations', () => {
    expect(reason('aws s3api put-public-access-block --bucket prod-logs --public-access-block-configuration BlockPublicAcls=true')).toBe('malformed argument');
    expect(reason('aws s3api put-bucket-acl --bucket prod-logs --acl public-read-write')).toBe('malformed argument');
  });

  it('rejects other commands, bad endpoints, and blank lines', () => {
    expect(reason('aws ec2 describe-instances')).toBe('unsupported command');
    expect(reason('aws s3 sync a b')).toBe('unsupported command');
    expect(reason('ls -la')).toBe('unsupported command');
    expect(reason('aws s3 ls --endpoint-url ftp://s3.example')).toBe('malformed argument');
    expect(reason('')).toBe('empty line');
    expect(reason('   ')).toBe('empty line');
  });
});
