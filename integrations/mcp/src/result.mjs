// Result building shared by all tools: sanitizing, secret stripping, 64 KiB cap.
import { sanitizeJudgeText } from '@ghost-run/core';

export const MAX_RESULT_BYTES = 64 * 1024;
export const TRUNCATED_MARKER = '[truncated]';
const FORBIDDEN_KEYS = new Set(['secretValues', 'payloads']);
const MAX_STRING_CODE_POINTS = 1_000_000;

/**
 * Deep copy: every string passes sanitizeJudgeText, secret and payload keys are dropped.
 * @param {unknown} value
 * @returns {any}
 */
export function cleanValue(value) {
  if (typeof value === 'string') return sanitizeJudgeText(value, MAX_STRING_CODE_POINTS);
  if (Array.isArray(value)) return value.map(cleanValue);
  if (value === null || typeof value !== 'object') return value;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!FORBIDDEN_KEYS.has(k)) out[sanitizeJudgeText(k, 256)] = cleanValue(v);
  }
  return out;
}

const byteLength = (/** @type {string} */ s) => Buffer.byteLength(s, 'utf8');

/**
 * Cut `text` to at most `maxBytes` bytes including the marker, at a line boundary.
 * @param {string} text
 * @param {number} [maxBytes]
 * @returns {{ text: string, truncated: boolean }}
 */
export function truncateText(text, maxBytes = MAX_RESULT_BYTES) {
  if (byteLength(text) <= maxBytes) return { text, truncated: false };
  const budget = maxBytes - byteLength(`\n${TRUNCATED_MARKER}`);
  const lines = text.split('\n');
  let used = 0;
  /** @type {string[]} */
  const kept = [];
  for (const line of lines) {
    const next = used + byteLength(line) + (kept.length > 0 ? 1 : 0);
    if (next > budget) break;
    kept.push(line);
    used = next;
  }
  return { text: `${kept.join('\n')}\n${TRUNCATED_MARKER}`, truncated: true };
}

/**
 * @param {Record<string, unknown>} structured
 * @param {{ isError?: boolean, text?: string }} [opts]
 */
export function makeResult(structured, opts = {}) {
  const clean = cleanValue(structured);
  const rendered = typeof opts.text === 'string' ? sanitizeJudgeText(opts.text, MAX_STRING_CODE_POINTS) : JSON.stringify(clean, null, 2);
  const cut = truncateText(rendered);
  let sc = clean;
  if (byteLength(JSON.stringify(clean)) > MAX_RESULT_BYTES) {
    // Keep only small scalar fields; the full detail does not fit.
    /** @type {Record<string, unknown>} */
    sc = {};
    for (const [k, v] of Object.entries(clean)) {
      if (v === null || ['number', 'boolean'].includes(typeof v) || (typeof v === 'string' && byteLength(v) <= 1024)) sc[k] = v;
    }
    cut.truncated = true;
    if (!cut.text.endsWith(TRUNCATED_MARKER)) cut.text = truncateText(`${cut.text}\n${'x'.repeat(MAX_RESULT_BYTES)}`).text;
  }
  const structuredContent = { ...sc, ...(cut.truncated ? { truncated: true } : {}) };
  /** @type {{ content: { type: 'text', text: string }[], structuredContent: Record<string, unknown>, isError?: true }} */
  const result = { content: [{ type: 'text', text: cut.text }], structuredContent };
  if (opts.isError) result.isError = true;
  return result;
}

/**
 * Error result with a message and optional extra fields.
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
export function errorResult(message, extra = {}) {
  return makeResult({ ...extra, error: message }, { isError: true, text: message });
}

/**
 * Error result for input that failed its schema; names the field.
 * @param {string} field
 * @param {string} message
 */
export function invalidInputResult(field, message) {
  return errorResult(`Invalid input: ${field}: ${message}`, { field });
}
