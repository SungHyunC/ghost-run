// State and action types of the ghost-cloud world. Plain, serializable data only.
// Sorted arrays are used instead of Map or keyed objects (design decision D1).

export type Acl = 'private' | 'public-read';

export interface StoredObject {
  readonly key: string;
  readonly content: string;
}

export interface BucketState {
  readonly name: string;
  readonly acl: Acl;
  readonly publicAccessBlocked: boolean;
  /** Sorted by key, code-point order. */
  readonly objects: readonly StoredObject[];
}

export interface LocalFile {
  readonly path: string;
  readonly content: string;
}

export interface CloudState {
  /** Sorted by name. */
  readonly buckets: readonly BucketState[];
  /** Read-only virtual local files, sorted by path. */
  readonly localFiles: readonly LocalFile[];
}

/** The endpoint option is omitted when absent, never set to undefined. */
interface WithEndpoint {
  readonly endpointUrl?: string;
}

export type Action =
  | ({ kind: 'ls'; bucket?: string; prefix?: string } & WithEndpoint)
  | ({ kind: 'mb'; bucket: string } & WithEndpoint)
  | ({ kind: 'rb'; bucket: string; force: boolean } & WithEndpoint)
  | ({
      kind: 'cp';
      bucket: string;
      key: string;
      source?: string;
      fromBucket?: string;
      fromKey?: string;
    } & WithEndpoint)
  | ({ kind: 'rm'; bucket: string; key: string; recursive: boolean } & WithEndpoint)
  | ({ kind: 'put-bucket-acl'; bucket: string; acl: Acl } & WithEndpoint)
  | ({ kind: 'put-public-access-block'; bucket: string; blocked: boolean } & WithEndpoint)
  | ({ kind: 'delete-public-access-block'; bucket: string } & WithEndpoint)
  | { kind: 'unsupported'; line: string; reason: string };

export type ActionKind = Action['kind'];

export const PROTECTED_PREFIX = 'prod-';
export const ACL_PREFIX = '_acl';
export const BLOCK_PREFIX = '_public-access-block';
export const LOCAL_PREFIX = '_local';
export const MAX_LINE_LENGTH = 1024;
export const MAX_PLAN_LINES = 50;
