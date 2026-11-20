// Lazy loading of the two engine chunks. The dynamic imports are the only place the page names them,
// so neither chunk is in the Entry_Bundle. A rejected import is never kept: each call imports again,
// and the controller keeps only a promise that resolved.

import type { LiveLoaders } from './types';

export type { LightEngines, LiveLoaders } from './types';

/** The default loaders: light = Shell and Cloud, hand = Ghost Hand (MuJoCo wasm and the simulation worker). */
export const defaultLoaders: LiveLoaders = {
  light: () => import('./engine-light').then((m) => m.createLightEngines()),
  hand: () => import('./engine-hand').then((m) => m.createHandEngine()),
};
