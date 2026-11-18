// World registration (kiro-integration convention): default export { id, deterministic, wardsFile, create }.
// `create` is a placeholder; task 7.5 replaces it with createGhostHandWorld.
// `deterministic` stays false until the registration gate passes (task 12.12).

export interface DrawerArmWorldConfig {
  readonly id: 'drawer-arm';
  readonly deterministic: boolean;
  readonly wardsFile: string;
  readonly create: () => Promise<never>;
}

const config: DrawerArmWorldConfig = {
  id: 'drawer-arm',
  deterministic: false,
  wardsFile: './wards.yaml',
  create: () => Promise.reject(new Error('drawer-arm: createGhostHandWorld is not implemented yet')),
};

export default config;
