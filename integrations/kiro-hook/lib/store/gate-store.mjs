// The Ghost_Store as the gate's `decide` sees it. Every write goes through ghost-store.mjs.
import { appendLine, loadCanaries, storePaths } from './ghost-store.mjs';
import { readProvenance } from './provenance.mjs';
import { writeRunRecord } from './runs.mjs';

/**
 * @typedef {object} GateStore
 * @property {(line: string) => Promise<import('./ghost-store.mjs').WriteResult>} appendStats
 * @property {(result: import('@ghost-run/ghost-runner').RunResult, canaries: readonly Uint8Array[]) => Promise<import('./ghost-store.mjs').WriteResult>} writeRun
 * @property {(line: string) => Promise<import('./ghost-store.mjs').WriteResult>} writeGrave Takes the redacted line of `graveLine`.
 * @property {(key: string) => Promise<import('@ghost-run/core').ProvenanceLog>} readProvenance
 * @property {(wardSet: import('@ghost-run/core').WardSet) => Promise<Uint8Array[]>} loadCanaries
 * @property {string} locksDir Folder of the semaphore slots.
 */

/**
 * Real Ghost_Store of a workspace root.
 * @param {string} root
 * @returns {GateStore}
 */
export function createGateStore(root) {
  const paths = storePaths(root);
  return {
    appendStats: (line) => appendLine(paths.stats, line),
    writeRun: async (result, canaries) => {
      const w = await writeRunRecord(root, result, canaries);
      return w.ok ? { ok: true } : w;
    },
    writeGrave: (line) => appendLine(paths.graveyard, line),
    readProvenance: async (key) => (await readProvenance(root, key)).log,
    loadCanaries: (wardSet) => loadCanaries(root, wardSet),
    locksDir: paths.locks,
  };
}
