// Grave_Entry (Requirement 14): building and reading the graveyard file.
// The entry shape is the GraveEntry type of @ghost-run/ui; it is imported as a
// type only and never declared a second time.
import { collectNeedles, scanText, traceRedThread } from '@ghost-run/core';
import { readLines, readText } from '../store/ghost-store.mjs';
import { redactCanaries } from '../store/redact.mjs';

/** @typedef {import('@ghost-run/ui').GraveEntry} GraveEntry */
/** @typedef {import('@ghost-run/ghost-runner').RunResult} RunResult */
/** @typedef {import('@ghost-run/core').ProvenanceLog} ProvenanceLog */

const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

/** Keys that never belong in a stored record. */
const FORBIDDEN_KEYS = new Set(['secretValues', 'payloads']);

/**
 * True for a `YYYY-MM-DDTHH:MM:SSZ` text that is a real UTC time.
 * @param {unknown} s
 * @returns {boolean}
 */
export function isGraveTime(s) {
  if (typeof s !== 'string') return false;
  const m = TIME_RE.exec(s);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= days;
}

/**
 * Deep copy without the forbidden keys and without byte buffers or maps.
 * @param {unknown} value
 * @returns {unknown}
 */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Uint8Array || value instanceof Map || value instanceof Set) return undefined;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!FORBIDDEN_KEYS.has(k)) out[k] = clean(v);
  }
  return out;
}

/**
 * Pure. Build the Grave_Entry of a `block` or `warn` run.
 * Returns null when the run id or the time is not valid for a Grave_Entry; the
 * caller then fails closed (store-failed).
 * @param {{ runId: string, command: string, recordedAt: string, result: RunResult, provenance?: ProvenanceLog }} input
 * @returns {GraveEntry | null}
 */
export function buildGraveEntry({ runId, command, recordedAt, result, provenance }) {
  if (typeof runId !== 'string' || !RUN_ID_RE.test(runId) || `g-${runId}`.length > 64) return null;
  if (!isGraveTime(recordedAt) || typeof command !== 'string') return null;
  if (result === null || typeof result !== 'object') return null;

  const verdict = result.wardVerdict;
  const violations = Array.isArray(verdict?.violations) ? verdict.violations : [];
  /** @type {string[]} */
  const wardIds = [];
  for (const v of violations) {
    if (v && typeof v.wardId === 'string' && !wardIds.includes(v.wardId)) wardIds.push(v.wardId);
  }

  const iso = result.isolation;
  /** @type {Record<string, unknown>} */
  const detail = {};
  if (verdict) detail.wardVerdict = clean(verdict);
  const changes = result.report?.changes;
  if (Array.isArray(changes)) detail.changes = clean(changes);
  if (iso && typeof iso === 'object') {
    detail.claims = {
      mode: iso.mode,
      p1Claimed: iso.p1Claimed === true,
      p5Claimed: iso.p5Claimed === true,
      p6Claimed: iso.p6Claimed === true,
    };
  }
  detail.actionLabels = [command];

  if (Array.isArray(provenance) && provenance.length > 0 && result.report) {
    const needles = collectNeedles(result.report);
    if (needles.length > 0) {
      detail.sources = provenance.map((r) => ({ source: r.source, text: r.content, scan: scanText(r.content) }));
      detail.needles = clean(needles);
      detail.links = clean(traceRedThread(provenance, needles));
    }
  }

  return /** @type {GraveEntry} */ ({ id: `g-${runId}`, command, recordedAt, wardIds, detail });
}

/**
 * The line to write for an entry: the whole serialized entry passes
 * `redactCanaries` as one string.
 * @param {GraveEntry} entry
 * @param {readonly Uint8Array[]} canaries
 * @returns {string}
 */
export function graveLine(entry, canaries) {
  return redactCanaries(JSON.stringify(entry), canaries);
}

/**
 * @param {unknown} o
 * @returns {o is GraveEntry}
 */
function isGraveEntry(o) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return false;
  const e = /** @type {Record<string, unknown>} */ (o);
  if (typeof e.id !== 'string' || !RUN_ID_RE.test(e.id)) return false;
  if (typeof e.command !== 'string' || !isGraveTime(e.recordedAt)) return false;
  if (!Array.isArray(e.wardIds) || !e.wardIds.every((w) => typeof w === 'string')) return false;
  if (e.detail !== undefined && (e.detail === null || typeof e.detail !== 'object' || Array.isArray(e.detail))) return false;
  return true;
}

/**
 * Read the graveyard file. Valid entries come back in file order; corrupt
 * lines (bad JSON, wrong shape, a torn last line) are skipped and counted.
 * A missing file reads as empty.
 * @param {string} file
 * @returns {Promise<{ entries: GraveEntry[], corrupt: number }>}
 */
export async function readGraveyard(file) {
  const { lines, corrupt: torn } = readLines(await readText(file));
  let corrupt = torn;
  /** @type {GraveEntry[]} */
  const entries = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (isGraveEntry(parsed)) entries.push(parsed);
      else corrupt++;
    } catch {
      corrupt++;
    }
  }
  return { entries, corrupt };
}
