// Reference_Model of the ghost-cloud world: a flat Map from virtual path to content, updated
// imperatively by its own small interpreter. It is written apart from src/apply.ts and src/diff.ts
// and imports only types (design Component 10). It is not a model of a real S3 service.
import type { DeterministicTestAdapter } from '@ghost-run/core/verify';
import type { Action, CloudState } from '../../src/types.js';

export interface RefEvent {
  readonly kind: 'file-created' | 'file-overwritten' | 'file-deleted';
  readonly path: string;
}

function cpOrder(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return (x[i] as number) < (y[i] as number) ? -1 : 1;
  }
  return x.length - y.length;
}

function keyOk(key: string): boolean {
  if (key === '' || key.charAt(0) === '/') return false;
  for (const seg of key.split('/')) {
    if (seg === '' || seg === '..') return false;
  }
  return true;
}

function prefixOk(prefix: string): boolean {
  if (prefix === '') return true;
  if (prefix.charAt(0) === '/') return false;
  const segs = prefix.split('/');
  for (let i = 0; i < segs.length; i++) {
    if (segs[i] === '..') return false;
    if (segs[i] === '' && i !== segs.length - 1) return false;
  }
  return true;
}

/** Runs the actions on a flat model of `state` and returns the events of every action, in order. */
export function referenceEvents(state: CloudState, actions: readonly Action[]): RefEvent[] {
  const paths = new Map<string, string>();
  const locals = new Map<string, string>();
  for (const f of state.localFiles) locals.set(f.path, f.content);
  for (const b of state.buckets) {
    paths.set(b.name, '');
    paths.set(`_acl/${b.name}`, b.acl);
    if (b.publicAccessBlocked) paths.set(`_public-access-block/${b.name}`, 'blocked');
    for (const o of b.objects) paths.set(`${b.name}/${o.key}`, o.content);
  }

  const all: RefEvent[] = [];

  for (const a of actions) {
    const ev: RefEvent[] = [];
    const put = (p: string, c: string): void => {
      if (!paths.has(p)) ev.push({ kind: 'file-created', path: p });
      else if (paths.get(p) !== c) ev.push({ kind: 'file-overwritten', path: p });
      paths.set(p, c);
    };
    const del = (p: string): void => {
      if (paths.has(p)) {
        ev.push({ kind: 'file-deleted', path: p });
        paths.delete(p);
      }
    };
    const objectPaths = (bucket: string): string[] => {
      const out: string[] = [];
      for (const p of paths.keys()) if (p.startsWith(`${bucket}/`)) out.push(p);
      return out;
    };
    const exists = (bucket: string): boolean => paths.has(bucket);

    switch (a.kind) {
      case 'ls':
      case 'unsupported':
        break;
      case 'mb':
        if (!exists(a.bucket)) {
          put(a.bucket, '');
          paths.set(`_acl/${a.bucket}`, 'private');
          paths.set(`_public-access-block/${a.bucket}`, 'blocked');
        }
        break;
      case 'rb': {
        if (!exists(a.bucket)) break;
        const objs = objectPaths(a.bucket);
        if (objs.length > 0 && !a.force) break;
        for (const p of objs) del(p);
        del(a.bucket);
        paths.delete(`_acl/${a.bucket}`);
        paths.delete(`_public-access-block/${a.bucket}`);
        break;
      }
      case 'cp': {
        if (!exists(a.bucket) || !keyOk(a.key)) break;
        let content: string | undefined;
        if (a.source !== undefined) content = locals.get(a.source);
        else if (a.fromBucket !== undefined && a.fromKey !== undefined) {
          if (exists(a.fromBucket) && keyOk(a.fromKey)) content = paths.get(`${a.fromBucket}/${a.fromKey}`);
        }
        if (content === undefined) break;
        put(`${a.bucket}/${a.key}`, content);
        break;
      }
      case 'rm': {
        if (!exists(a.bucket)) break;
        if (a.recursive) {
          if (!prefixOk(a.key)) break;
          for (const p of objectPaths(a.bucket)) {
            if (p.slice(a.bucket.length + 1).startsWith(a.key)) del(p);
          }
        } else if (keyOk(a.key)) {
          del(`${a.bucket}/${a.key}`);
        }
        break;
      }
      case 'put-bucket-acl':
        if (exists(a.bucket)) put(`_acl/${a.bucket}`, a.acl);
        break;
      case 'put-public-access-block':
        if (exists(a.bucket)) {
          if (a.blocked) put(`_public-access-block/${a.bucket}`, 'blocked');
          else del(`_public-access-block/${a.bucket}`);
        }
        break;
      case 'delete-public-access-block':
        if (exists(a.bucket)) del(`_public-access-block/${a.bucket}`);
        break;
    }
    ev.sort((x, y) => cpOrder(x.path, y.path));
    all.push(...ev);
  }
  return all;
}

/** The `testAdapter` of the registration gate: the change set of the Reference_Model. */
export function createReferenceAdapter(): DeterministicTestAdapter<CloudState, Action> {
  return {
    apply(state: CloudState, actions: readonly Action[]) {
      return referenceEvents(state, actions).map((e) => ({ kind: e.kind, path: e.path }));
    },
  };
}
