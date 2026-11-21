// Leftover check for the docker tests: only containers and volumes whose run id this test process issued.
// A gate rehearsal elsewhere on the machine labels its containers with the same key and must not count.
// Usage in a test file (vi.mock is hoisted, so it cannot live here):
//   const issued = vi.hoisted(() => new Set<string>());
//   vi.mock('node:crypto', async (orig) => (await import('./own-run-ids.js')).recordRandomUuid(await orig<typeof import('node:crypto')>(), issued));
// (the dynamic import is needed: a hoisted factory cannot use a static import)
import { spawnSync } from 'node:child_process';

type CryptoModule = typeof import('node:crypto');

/** The crypto module with `randomUUID` wrapped so that every id it returns is added to `issued`. */
export function recordRandomUuid(actual: CryptoModule, issued: Set<string>): CryptoModule {
  const randomUUID: CryptoModule['randomUUID'] = (...args) => {
    const id = actual.randomUUID(...args);
    issued.add(id);
    return id;
  };
  return { ...actual, default: { ...actual, randomUUID }, randomUUID } as CryptoModule;
}

function labelValues(args: string[]): string[] {
  const r = spawnSync('docker', [...args, '--filter', 'label=ghost-run.run-id', '--format', '{{.Label "ghost-run.run-id"}}'], { encoding: 'utf8' });
  return r.stdout.split('\n').map((l) => l.trim()).filter((l) => l !== '');
}

/** Run ids of `issued` that still have a container or a volume (one label value per leftover object). */
export function leftoversOf(issued: ReadonlySet<string>): string[] {
  return [...labelValues(['ps', '-a']), ...labelValues(['volume', 'ls'])].filter((id) => issued.has(id));
}
