import { compareCodePoints } from '@ghost-run/core';
import type { FileChange } from '@ghost-run/core';
import { ACL_PREFIX, BLOCK_PREFIX } from './types.js';
import type { BucketState, CloudState } from './types.js';

type Kind = FileChange['kind'];

/** The minimal FileChange list between two states (design Component 5). Pure. */
export function diffStates(before: CloudState, after: CloudState): FileChange[] {
  const out = new Map<string, Kind>();
  const bMap = new Map(before.buckets.map((b) => [b.name, b]));
  const aMap = new Map(after.buckets.map((b) => [b.name, b]));

  const addAll = (b: BucketState, kind: Kind): void => {
    out.set(b.name, kind);
    for (const o of b.objects) out.set(`${b.name}/${o.key}`, kind);
  };

  for (const [name, b] of bMap) if (!aMap.has(name)) addAll(b, 'file-deleted');
  for (const [name, b] of aMap) if (!bMap.has(name)) addAll(b, 'file-created');

  for (const [name, b] of bMap) {
    const a = aMap.get(name);
    if (a === undefined) continue;
    const bo = new Map(b.objects.map((o) => [o.key, o.content]));
    const ao = new Map(a.objects.map((o) => [o.key, o.content]));
    for (const [key, content] of bo) {
      if (!ao.has(key)) out.set(`${name}/${key}`, 'file-deleted');
      else if (ao.get(key) !== content) out.set(`${name}/${key}`, 'file-overwritten');
    }
    for (const key of ao.keys()) if (!bo.has(key)) out.set(`${name}/${key}`, 'file-created');
    if (b.acl !== a.acl) out.set(`${ACL_PREFIX}/${name}`, 'file-overwritten');
    if (b.publicAccessBlocked && !a.publicAccessBlocked) out.set(`${BLOCK_PREFIX}/${name}`, 'file-deleted');
    if (!b.publicAccessBlocked && a.publicAccessBlocked) out.set(`${BLOCK_PREFIX}/${name}`, 'file-created');
  }

  return [...out.entries()]
    .sort((x, y) => compareCodePoints(x[0], y[0]))
    .map(([path, kind]) => ({ kind, path }));
}
