// World registration (kiro-integration convention): default export { id, deterministic, wardsFile, create }.
// `deterministic: true` was set after tests/contract.test.ts passed (task 12.12). The flag is limited to the Tested_Environments.
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
  deterministic: true,
  wardsFile: './wards.yaml',
  create: () => createGhostHandWorld(),
};

export default config;
