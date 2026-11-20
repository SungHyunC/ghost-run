import { compareCodePoints, sanitizeJudgeText } from '@ghost-run/core';
import type { Action, BucketState, CloudState, StoredObject } from './types.js';

export type ApplyResult =
  | { readonly ok: true; readonly state: CloudState }
  | { readonly ok: false; readonly error: string };

type MutBucket = {
  name: string;
  acl: BucketState['acl'];
  publicAccessBlocked: boolean;
  objects: { key: string; content: string }[];
};
type MutState = { buckets: MutBucket[]; localFiles: { path: string; content: string }[] };

const BUCKET_NAME_RE = /^[a-z0-9.-]{3,63}$/;

class Invalid extends Error {}

function fail(text: string): never {
  throw new Invalid(text);
}

/** A token that comes from an action value; shown in an error text only after sanitizing. */
function tok(x: string): string {
  return sanitizeJudgeText(String(x), 80);
}

/** An object key: not empty, not absolute, no empty segment, no `..` segment. */
export function isValidObjectKey(key: string): boolean {
  if (typeof key !== 'string' || key === '' || key.startsWith('/')) return false;
  return key.split('/').every((seg) => seg !== '' && seg !== '..');
}

/** A prefix: empty, or like a key with one optional trailing slash. */
export function isValidPrefix(prefix: string): boolean {
  if (typeof prefix !== 'string') return false;
  if (prefix === '') return true;
  if (prefix.startsWith('/')) return false;
  const segs = prefix.split('/');
  return segs.every((seg, i) => seg !== '..' && (seg !== '' || i === segs.length - 1));
}

function findBucket(st: MutState, name: string): MutBucket {
  const b = st.buckets.find((x) => x.name === name);
  if (b === undefined) fail(`bucket does not exist: ${tok(name)}`);
  return b;
}

function sortObjects(b: MutBucket): void {
  b.objects.sort((x, y) => compareCodePoints(x.key, y.key));
}

function run(st: MutState, a: Action): void {
  switch (a.kind) {
    case 'ls': {
      if (a.bucket !== undefined) findBucket(st, a.bucket);
      return;
    }
    case 'mb': {
      if (!BUCKET_NAME_RE.test(a.bucket)) fail(`invalid bucket name: ${tok(a.bucket)}`);
      if (st.buckets.some((b) => b.name === a.bucket)) fail(`bucket already exists: ${tok(a.bucket)}`);
      st.buckets.push({ name: a.bucket, acl: 'private', publicAccessBlocked: true, objects: [] });
      st.buckets.sort((x, y) => compareCodePoints(x.name, y.name));
      return;
    }
    case 'rb': {
      const b = findBucket(st, a.bucket);
      if (b.objects.length > 0 && !a.force) fail(`bucket is not empty: ${tok(a.bucket)}`);
      st.buckets = st.buckets.filter((x) => x.name !== a.bucket);
      return;
    }
    case 'cp': {
      const dest = findBucket(st, a.bucket);
      if (!isValidObjectKey(a.key)) fail(`invalid object key: ${tok(a.key)}`);
      let content: string;
      if (a.source !== undefined) {
        const f = st.localFiles.find((x) => x.path === a.source);
        if (f === undefined) fail(`local file does not exist: ${tok(a.source)}`);
        content = f.content;
      } else if (a.fromBucket !== undefined && a.fromKey !== undefined) {
        const sb = findBucket(st, a.fromBucket);
        if (!isValidObjectKey(a.fromKey)) fail(`invalid object key: ${tok(a.fromKey)}`);
        const o = sb.objects.find((x) => x.key === a.fromKey);
        if (o === undefined) fail(`object does not exist: ${tok(a.fromBucket)}/${tok(a.fromKey)}`);
        content = o.content;
      } else {
        return fail('copy has no source');
      }
      const existing = dest.objects.find((x) => x.key === a.key);
      if (existing !== undefined) existing.content = content;
      else {
        dest.objects.push({ key: a.key, content });
        sortObjects(dest);
      }
      return;
    }
    case 'rm': {
      const b = findBucket(st, a.bucket);
      if (a.recursive) {
        if (!isValidPrefix(a.key)) fail(`invalid prefix: ${tok(a.key)}`);
        b.objects = b.objects.filter((o) => !o.key.startsWith(a.key));
      } else {
        if (!isValidObjectKey(a.key)) fail(`invalid object key: ${tok(a.key)}`);
        b.objects = b.objects.filter((o) => o.key !== a.key);
      }
      return;
    }
    case 'put-bucket-acl': {
      findBucket(st, a.bucket).acl = a.acl;
      return;
    }
    case 'put-public-access-block': {
      findBucket(st, a.bucket).publicAccessBlocked = a.blocked;
      return;
    }
    case 'delete-public-access-block': {
      findBucket(st, a.bucket).publicAccessBlocked = false;
      return;
    }
    case 'unsupported':
      fail(`unsupported step: ${tok(a.reason)}`);
  }
}

/** Pure and total: works on a deep copy, never mutates `state`, never throws. */
export function applyAction(state: CloudState, action: Action): ApplyResult {
  const st = structuredClone(state) as unknown as MutState;
  try {
    run(st, action);
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    return { ok: false, error: 'invalid action' };
  }
  return { ok: true, state: st as unknown as CloudState };
}

export type { StoredObject };
