import MainModuleFactory from '@mujoco/mujoco';
import type { MuJoCoModule, MujocoLoadOptions } from './mujoco-subset.js';

let memo: Promise<MuJoCoModule> | undefined;

/**
 * Loads the single-thread MuJoCo WebAssembly module once per realm and returns the same promise
 * on every later call (the options of a later call are ignored). A failed load is not kept, so a
 * retry starts again.
 *
 * Wasm location (probe, docs/measurements.md): mujoco.js finds the binary with
 * `new URL('mujoco.wasm', import.meta.url)`, which works in Node without an option. A bundler
 * build passes `locateFile` that returns the URL of the bundled asset (in Vite, the `?url`
 * import of `@mujoco/mujoco/mujoco.wasm`); it is called with `path = 'mujoco.wasm'`.
 * The default build has a non-shared heap, so no COOP or COEP header is needed.
 */
export function loadMujoco(options?: MujocoLoadOptions): Promise<MuJoCoModule> {
  if (memo === undefined) {
    const factoryOptions = options?.locateFile === undefined ? undefined : { locateFile: options.locateFile };
    const attempt = (MainModuleFactory(factoryOptions) as unknown as Promise<MuJoCoModule>).catch((error: unknown) => {
      if (memo === attempt) memo = undefined;
      throw error;
    });
    memo = attempt;
  }
  return memo;
}
