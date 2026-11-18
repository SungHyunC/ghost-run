import { webcrypto } from 'node:crypto';

// jsdom may not expose crypto.subtle; the fingerprint needs SHA-256.
const g = globalThis as { crypto?: { subtle?: unknown } };
if (g.crypto === undefined || g.crypto.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
}
