// World registration (local convention of the world-scaffold hook).
// `wardsFile` is a path string only; it is never imported.
import { createPlaygroundWorld } from './src/world.js';

export default {
  id: 'playground-shell',
  deterministic: true,
  wardsFile: '../../apps/ghost-shell/wards.yaml',
  create: createPlaygroundWorld,
} as const;
