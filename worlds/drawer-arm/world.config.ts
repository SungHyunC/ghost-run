// World registration (kiro-integration convention): default export { id, deterministic, wardsFile, create }.
// `deterministic` stays false until the registration gate passes (task 12.12).
import { createGhostHandWorld } from './src/world.js';
import type { GhostHandWorld } from './src/world.js';

export interface DrawerArmWorldConfig {
  readonly id: 'drawer-arm';
  readonly deterministic: boolean;
  readonly wardsFile: string;
  readonly create: () => Promise<GhostHandWorld>;
}

const config: DrawerArmWorldConfig = {
  id: 'drawer-arm',
  deterministic: false,
  wardsFile: './wards.yaml',
  create: () => createGhostHandWorld(),
};

export default config;
