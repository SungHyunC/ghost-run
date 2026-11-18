// Ghost Run+ ghost-log (Post Tool Use). Records provenance of what the agent read and the Stats_Event
// `executed` of a shell call. It never blocks and never changes the tool call: exit 0 after a record or
// an intended skip, exit 1 with one failure-class line on STDERR otherwise. No LLM and no network call.
import { readStdinBounded } from './lib/hook-io.mjs';

const MAX_STDIN_BYTES = 8 * 1_048_576;
const INTERNAL = 'GHOST RUN LOG: internal-error; no provenance was recorded.\n';
const UNAVAILABLE = 'GHOST RUN LOG: unavailable; build the packages first (pnpm -r build).\n';

/** @param {string} line @param {number} code */
function end(line, code) {
  if (line === '') process.exit(code);
  process.stderr.write(line, () => process.exit(code));
}

process.on('uncaughtException', () => end(INTERNAL, 1));
process.on('unhandledRejection', () => end(INTERNAL, 1));

const nowMs = () => performance.timeOrigin + performance.now();

/** @returns {Promise<{ exit: number, stderr: string }>} */
async function main() {
  /** @type {typeof import('./lib/log/run.mjs')} */
  let mod;
  try {
    mod = await import('./lib/log/run.mjs');
  } catch {
    return { exit: 1, stderr: UNAVAILABLE };
  }
  try {
    const text = await readStdinBounded(process.stdin, MAX_STDIN_BYTES);
    return await mod.runLog(text, {
      cwd: process.cwd(),
      env: { GHOST_RUN_WARDS_FILE: process.env.GHOST_RUN_WARDS_FILE },
      nowMs,
    });
  } catch (err) {
    // Only an over-bound STDIN has a code; it counts as one skip (too-large).
    const tooLarge = typeof err === 'object' && err !== null && /** @type {{ code?: unknown }} */ (err).code === 'too-large';
    return tooLarge ? await mod.recordOversized(process.cwd(), nowMs) : mod.failure('internal-error');
  }
}

const outcome = await main();
end(outcome.stderr, outcome.exit);
