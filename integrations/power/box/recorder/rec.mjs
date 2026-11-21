// Shared helpers of the in-box recorder: the /ghost-rec location, the current step index,
// and size-capped JSON Lines logs. Node built-ins only. Runs inside the box.
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REC_DIR = process.env.GHOST_REC_DIR || '/ghost-rec';

/** Cap per listener log. Past it a single `{"overflow":true}` line is written so the host fails closed. */
export const MAX_LOG_BYTES = 16 * 1024 * 1024;

/** Request body capture cap (Req 8.4). */
export const BODY_CAP_BYTES = 64 * 1024;

/** Step index written by ghost-step before each action. Falls back to 0 when missing or invalid. */
export function currentStep() {
  try {
    const text = readFileSync(join(REC_DIR, 'current-step'), 'utf8').trim();
    if (/^[0-9]{1,9}$/.test(text)) return Number(text);
  } catch {
    // no step running yet
  }
  return 0;
}

const written = new Map();

/** Append one JSON line to `<REC_DIR>/<file>`. Never throws. */
export function logLine(file, obj) {
  const line = `${JSON.stringify(obj)}\n`;
  const used = written.get(file) ?? 0;
  try {
    if (used + line.length > MAX_LOG_BYTES) {
      if (used <= MAX_LOG_BYTES) {
        appendFileSync(join(REC_DIR, file), '{"overflow":true}\n');
        written.set(file, MAX_LOG_BYTES + 1);
      }
      return;
    }
    appendFileSync(join(REC_DIR, file), line);
    written.set(file, used + line.length);
  } catch (err) {
    process.stderr.write(`ghost-rec: cannot write ${file}: ${err && err.code ? err.code : 'error'}\n`);
  }
}
