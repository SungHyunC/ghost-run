// Ghost Run+ gate bootstrap (Pre Tool Use). Imports only ./lib/hook-io.mjs and the constant file
// ./gate-config.mjs (which hook-io already imports) (design D3). The real gate is loaded with a dynamic
// import inside try/catch (in `runHook`), so a missing build or a syntax error exits 2, not the Node
// default 1. Exit 0 happens only on the allow paths of the gate.
import { WATCHDOG_MS } from './gate-config.mjs';
import { fatal, runHook } from './lib/hook-io.mjs';

/** @type {{ cleanupOnTimeout?: () => Promise<void> } | undefined} */
let gate;

// Watchdog: no verdict within WATCHDOG_MS. Ask the loaded gate to remove the run's boxes and temp
// folder (bounded by its own timeouts), then print the fixed timeout line and exit 2.
setTimeout(() => {
  void (async () => {
    try {
      await gate?.cleanupOnTimeout?.();
    } catch {
      // swallowed: the exit must still happen
    }
    fatal('timeout');
  })();
}, WATCHDOG_MS);

// runHook installs the uncaughtException and unhandledRejection handlers (fatal 'internal-error'),
// reads STDIN with a 1 MiB bound, loads the gate, writes the outcome, and exits 0 or 2.
await runHook('ghost-gate', async () => {
  const mod = await import('./lib/gate/main.mjs');
  gate = mod;
  return mod;
});
