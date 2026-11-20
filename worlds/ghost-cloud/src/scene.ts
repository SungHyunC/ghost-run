import type { Scene } from '@ghost-run/core';
import { PROTECTED_PREFIX } from './types.js';
import type { CloudState } from './types.js';

/** The scene of a state: buckets in order with objects, ACL, and block flag. Pure, no timestamp. */
export function renderScene(state: CloudState): Scene {
  return {
    world: 'ghost-cloud',
    buckets: state.buckets.map((b) => ({
      name: b.name,
      protected: b.name.startsWith(PROTECTED_PREFIX),
      acl: b.acl,
      publicAccessBlocked: b.publicAccessBlocked,
      objectCount: b.objects.length,
      objects: b.objects.map((o) => ({ key: o.key, size: [...o.content].length })),
    })),
  };
}
