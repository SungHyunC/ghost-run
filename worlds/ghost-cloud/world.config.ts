// World registration (local convention of the world-scaffold hook): default export
// { id, deterministic, wardsFile, create }. `wardsFile` is a path string only; it is never imported.
//
// deterministic is true: P2 passes against the independent Reference_Model (task 6.3).
import { createGhostCloudWorld } from './src/world.js';

export default {
  id: 'ghost-cloud',
  deterministic: true,
  wardsFile: './wards.yaml',
  create: createGhostCloudWorld,
} as const;
