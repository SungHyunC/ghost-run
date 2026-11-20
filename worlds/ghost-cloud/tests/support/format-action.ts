// Test-only inverse of the parser: the canonical CLI line of a supported action.
import type { Action } from '../../src/types.js';

const ALL_TRUE = 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true';
const ONE_FALSE = 'BlockPublicAcls=false,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true';

function endpoint(a: { readonly endpointUrl?: string }): string {
  return a.endpointUrl === undefined ? '' : ` --endpoint-url ${a.endpointUrl}`;
}

/** Canonical line of an action. For `unsupported`, the stored line. */
export function formatAction(a: Action): string {
  switch (a.kind) {
    case 'ls': {
      const target = a.bucket === undefined ? '' : ` s3://${a.bucket}${a.prefix === undefined ? '' : `/${a.prefix}`}`;
      return `aws s3 ls${target}${endpoint(a)}`;
    }
    case 'mb':
      return `aws s3 mb s3://${a.bucket}${endpoint(a)}`;
    case 'rb':
      return `aws s3 rb s3://${a.bucket}${a.force ? ' --force' : ''}${endpoint(a)}`;
    case 'cp': {
      const src = a.source !== undefined ? a.source : `s3://${a.fromBucket ?? ''}/${a.fromKey ?? ''}`;
      return `aws s3 cp ${src} s3://${a.bucket}/${a.key}${endpoint(a)}`;
    }
    case 'rm': {
      const target = a.key === '' ? `s3://${a.bucket}` : `s3://${a.bucket}/${a.key}`;
      return `aws s3 rm ${target}${a.recursive ? ' --recursive' : ''}${endpoint(a)}`;
    }
    case 'put-bucket-acl':
      return `aws s3api put-bucket-acl --bucket ${a.bucket} --acl ${a.acl}${endpoint(a)}`;
    case 'put-public-access-block':
      return `aws s3api put-public-access-block --bucket ${a.bucket} --public-access-block-configuration ${a.blocked ? ALL_TRUE : ONE_FALSE}${endpoint(a)}`;
    case 'delete-public-access-block':
      return `aws s3api delete-public-access-block --bucket ${a.bucket}${endpoint(a)}`;
    case 'unsupported':
      return a.line;
  }
}
