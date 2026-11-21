// Test builders for the paging model: a PageVisibility value and a fake history.
import { PAGE_IDS, type PageId } from '../../src/data/pages';
import type { PageVisibility } from '../../src/engine/paging';

/** A PageVisibility whose `opened` holds the current page plus any extra pages. */
export function visibility(current: PageId, opened: readonly PageId[] = []): PageVisibility {
  const map = {} as Record<PageId, boolean>;
  for (const id of PAGE_IDS) map[id] = id === current || opened.includes(id);
  return { current, opened: map };
}

export interface FakeHistory {
  readonly calls: { readonly kind: 'push' | 'replace'; readonly url: string }[];
  pushState(data: unknown, unused: string, url: string): void;
  replaceState(data: unknown, unused: string, url: string): void;
  /** The last written hash, or the start hash when nothing was written. */
  hash(): string;
}

export function fakeHistory(startHash = ''): FakeHistory {
  let hash = startHash;
  const calls: FakeHistory['calls'] = [];
  return {
    calls,
    pushState(_d, _u, url) {
      calls.push({ kind: 'push', url });
      hash = url;
    },
    replaceState(_d, _u, url) {
      calls.push({ kind: 'replace', url });
      hash = url;
    },
    hash: () => hash,
  };
}
