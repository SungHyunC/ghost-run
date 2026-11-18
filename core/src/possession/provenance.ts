// Provenance record format: serialize and parse the log of texts the agent read.
// Pure: no clock, no randomness, no I/O. Never throws on any string input.

import type {
  ProvenanceError,
  ProvenanceKind,
  ProvenanceLog,
  ProvenanceParseResult,
  ProvenanceRecord,
} from './types.js';

const KINDS: readonly string[] = ['file', 'issue', 'web', 'other'];
const KNOWN_KEYS: readonly string[] = ['source', 'kind', 'content'];

/**
 * Writes the log as a JSON array. Each record is rebuilt as an object literal
 * with keys in the fixed order source, kind, content (no spread), so extra
 * fields on caller objects are never written.
 */
export function serializeProvenanceLog(log: ProvenanceLog): string {
  const records = log.map((r) => ({ source: r.source, kind: r.kind, content: r.content }));
  return JSON.stringify(records);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkRecord(
  element: unknown,
  index: number,
  errors: ProvenanceError[],
): ProvenanceRecord | undefined {
  if (!isPlainObject(element)) {
    errors.push({ index, message: `record must be an object, got ${describe(element)}` });
    return undefined;
  }

  const before = errors.length;

  for (const key of Object.keys(element)) {
    if (!KNOWN_KEYS.includes(key)) {
      errors.push({ index, field: key, message: `unknown field ${JSON.stringify(key)}` });
    }
  }

  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(element, key);
  const source = has('source') ? element['source'] : undefined;
  const kind = has('kind') ? element['kind'] : undefined;
  const content = has('content') ? element['content'] : undefined;

  if (typeof source !== 'string') {
    errors.push({ index, field: 'source', message: `source must be a string, got ${describe(source)}` });
  } else if (source.length === 0) {
    errors.push({ index, field: 'source', message: 'source must not be empty' });
  }

  if (typeof kind !== 'string' || !KINDS.includes(kind)) {
    errors.push({ index, field: 'kind', message: 'kind must be one of file, issue, web, other' });
  }

  if (typeof content !== 'string') {
    errors.push({ index, field: 'content', message: `content must be a string, got ${describe(content)}` });
  }

  if (errors.length > before) return undefined;
  return { source: source as string, kind: kind as ProvenanceKind, content: content as string };
}

/**
 * Parses a serialized log. Returns the log or every validation error found.
 * Never throws and never returns a partial log.
 */
export function parseProvenanceLog(text: string): ProvenanceParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [{ message: `invalid JSON: ${detail}` }] };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      errors: [{ message: `log must be a JSON array, got ${describe(parsed)}` }],
    };
  }

  const errors: ProvenanceError[] = [];
  const log: ProvenanceRecord[] = [];
  parsed.forEach((element: unknown, index: number) => {
    const record = checkRecord(element, index, errors);
    if (record !== undefined) log.push(record);
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, log };
}
