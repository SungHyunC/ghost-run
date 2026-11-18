// Duplicate-skip rule of design D10, as a pure function. Whether a call that the gate blocked also fires
// Post Tool Use is measured only for the CLI (it does not). The IDE result is pending, so ghost-log applies
// this rule: a Post Tool Use event whose command matches a graveyard entry written within the last 60 s,
// where that entry was blocked (or warned in `exit2` mode), is the echo of a call the gate stopped.
// The graveyard holds no session id or tool_use_id, so the match is on the command text alone.

/** Window of the rule, in milliseconds. */
export const DUPLICATE_WINDOW_MS = 60_000;

/**
 * @param {{
 *   command: string,
 *   entries: ReadonlyArray<{ command: string, recordedAt: string, detail?: unknown }>,
 *   nowMs: number,
 *   warnMode: 'exit2' | 'ask',
 *   redact?: (text: string) => string,
 * }} p
 * @returns {boolean}
 */
export function isBlockedDuplicate({ command, entries, nowMs, warnMode, redact = (t) => t }) {
  const forms = new Set([command, redact(command)]);
  for (const e of entries) {
    if (!forms.has(e.command)) continue;
    const at = Date.parse(e.recordedAt);
    if (!Number.isFinite(at)) continue;
    const age = nowMs - at;
    if (age < -DUPLICATE_WINDOW_MS || age > DUPLICATE_WINDOW_MS) continue;
    // In `ask` mode an approved warn does execute, so only a block counts as a duplicate there.
    if (warnMode === 'exit2') return true;
    const detail = /** @type {{ wardVerdict?: { verdict?: unknown } } | undefined} */ (e.detail);
    if (detail?.wardVerdict?.verdict === 'block') return true;
  }
  return false;
}
