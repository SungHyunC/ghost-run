// Ghost Run+ contract-pbt (PostFileSave on core/** and worlds/**, Requirement 15).
// Runs the safety-contract property tests in the short mode and writes
// .ghost-run/pbt/last.json. It never blocks a tool call and starts no nightly mode.
// No LLM call, no network call. STDOUT does not reach the agent in the CLI or the IDE
// (probe, CLI 3.4.0 and IDE 1.4.215), so last.json is the only channel.
import { STDIN_MAX_BYTES } from './gate-config.mjs';
import { processIo, readStdinBounded } from './lib/hook-io.mjs';
import { INTERNAL_ERROR_LINE, run } from './lib/pbt/main.mjs';

/** @type {(() => void)[]} */
const cleanups = [];
for (const sig of /** @type {const} */ (['SIGTERM', 'SIGINT'])) {
  process.once(sig, () => {
    for (const fn of cleanups) fn();
    process.exitCode = 1;
  });
}

try {
  const text = await readStdinBounded(process.stdin, STDIN_MAX_BYTES);
  const out = await run(text, { registerCleanup: (fn) => cleanups.push(fn) });
  processIo.stdout(out.stdout, () => {
    processIo.stderr(out.stderr, () => processIo.exit(out.exit));
  });
} catch {
  processIo.stderr(`${INTERNAL_ERROR_LINE}\n`, () => processIo.exit(1));
}
