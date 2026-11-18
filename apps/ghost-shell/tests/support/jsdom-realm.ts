// jsdom test environments only. Vitest's jsdom environment replaces the global `Uint8Array` with the jsdom
// window's copy, while Node built-ins (`TextEncoder`, `structuredClone`, sql.js) keep returning Node-realm
// arrays. `core` checks bytes with `instanceof Uint8Array`, so the realms must agree. A browser has a single
// realm; this setup restores the Node constructor to get the same behavior. Node-environment tests are untouched.
if (typeof window !== 'undefined') {
  const NodeUint8Array = new TextEncoder().encode('').constructor as Uint8ArrayConstructor;
  if (NodeUint8Array !== globalThis.Uint8Array) {
    Object.defineProperty(globalThis, 'Uint8Array', { value: NodeUint8Array, writable: true, configurable: true });
  }
}
