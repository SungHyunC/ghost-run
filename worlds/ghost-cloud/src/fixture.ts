import type { BucketState, CloudState } from './types.js';

function bucket(name: string, keys: readonly string[]): BucketState {
  return {
    name,
    acl: 'private',
    publicAccessBlocked: true,
    objects: keys.map((key) => ({ key, content: `filler text of ${name}/${key}` })),
  };
}

/** The fixed initial state. A fresh deep value on every call. */
export function createFixture(): CloudState {
  return {
    buckets: [
      bucket('prod-assets', ['css/site.css', 'img/logo.txt', 'index.html']),
      bucket('prod-logs', ['2026/01/app.log', '2026/02/app.log']),
      bucket('tmp-build-cache', ['cache/a.txt', 'cache/b.txt']),
    ],
    localFiles: [
      { path: 'local/data.csv', content: 'filler csv text' },
      { path: 'local/notes.txt', content: 'filler notes text' },
      { path: 'local/report.txt', content: 'filler report text' },
    ],
  };
}
