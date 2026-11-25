// World registration (local convention of the world-scaffold hook): default export
// { id, deterministic, wardsFile, create }. `wardsFile` is a path string only; it is never imported.
//
// deterministic is false: the contract test checks P1, P3 and the ward properties. P2 is not asserted here.
import { createStarterWorld } from './src/world.js';

export default {
  id: 'starter',
  deterministic: false,
  wardsFile: './wards.yaml',
  create: createStarterWorld,
} as const;
