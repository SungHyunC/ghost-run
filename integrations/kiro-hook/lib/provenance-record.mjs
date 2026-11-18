// Provenance record builder of ghost-log (Requirement 13). One Post Tool Use event gives one
// `{ source, kind, content }` record or one skip reason. The record has no clock, session, or
// secret field. Nothing here writes a file, calls a network, or calls an LLM.
import nodePath from 'node:path';
import { normalizePath } from '@ghost-run/core';
import { POST_RESPONSE_FIELDS, STORE_CAPS } from '../gate-config.mjs';
import { TOOL_TABLE } from './event.mjs';
import { containsCanary } from './store/redact.mjs';

/** Response field names, in lookup order: the measured name first, then the design candidates (IDE pending). */
export const RESPONSE_FIELD_CANDIDATES = Object.freeze([...POST_RESPONSE_FIELDS, 'tool_result', 'response']);

/** Built-in read tools that give a `file` record. */
export const FILE_READ_TOOLS = Object.freeze(['read_file']);

/** Web tools that give a `web` record. */
export const WEB_TOOLS = Object.freeze(['web_fetch']);

/** Longest content, in bytes (1 MiB). */
export const MAX_CONTENT_BYTES = STORE_CAPS.recordBytes;

/** Folded names of the ghost-run MCP server, as used in `mcp_<server>_<tool>`. */
const OWN_SERVER_PREFIXES = Object.freeze(['mcp_ghost-run_', 'mcp_ghost_run_']);

const MAX_LEAF_DEPTH = 8;

/**
 * @typedef {'secret-path' | 'canary' | 'too-large' | 'unknown-tool' | 'outside-workspace' | 'no-content'} SkipReason
 * @typedef {{ source: string, kind: 'file' | 'web' | 'other', content: string }} ProvenanceRecord
 * @typedef {{ record: ProvenanceRecord } | { skip: SkipReason }} BuildResult
 * @typedef {{ test(path: string): { matched: boolean, escapes?: boolean } }} SecretMatcher
 * @typedef {object} BuildContext
 * @property {string} root Absolute workspace root.
 * @property {SecretMatcher} secretMatcher Compiled `secrets` patterns of the egress wards.
 * @property {readonly Uint8Array[]} canaries Canary values of the secret files (memory only).
 * @property {(absPath: string, maxBytes: number) => Promise<string | null>} [readFile] Bounded file read for the fallback; null when unreadable.
 */

/**
 * True for a tool of the ghost-run MCP server itself (never recorded).
 * @param {string} toolName
 * @returns {boolean}
 */
export function isOwnServerTool(toolName) {
  return OWN_SERVER_PREFIXES.some((p) => toolName.startsWith(p));
}

/**
 * True for a shell tool (class `shell` in the tool table).
 * @param {string} toolName
 * @returns {boolean}
 */
export function isShellTool(toolName) {
  return Object.hasOwn(TOOL_TABLE, toolName) && TOOL_TABLE[toolName]?.class === 'shell';
}

/**
 * Collect string leaves of a value, depth-bounded, until `budget` characters are used.
 * @param {unknown} v
 * @param {string[]} out
 * @param {{ left: number }} budget
 * @param {number} depth
 */
function collectLeaves(v, out, budget, depth) {
  if (budget.left < 0 || depth > MAX_LEAF_DEPTH) return;
  if (typeof v === 'string') {
    out.push(v);
    budget.left -= v.length;
  } else if (Array.isArray(v)) {
    for (const x of v) collectLeaves(x, out, budget, depth + 1);
  } else if (typeof v === 'object' && v !== null) {
    for (const k of Object.keys(v)) collectLeaves(/** @type {Record<string, unknown>} */ (v)[k], out, budget, depth + 1);
  }
}

/**
 * Text of the tool response, or null when the host delivered none. A string is used as is; an object or
 * array contributes its string leaves joined with newlines (the cap check happens in the caller); any other
 * type counts as no response.
 * @param {Record<string, unknown>} event
 * @returns {string | null}
 */
export function responseText(event) {
  for (const field of RESPONSE_FIELD_CANDIDATES) {
    if (!Object.hasOwn(event, field)) continue;
    const v = event[field];
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null) {
      /** @type {string[]} */
      const leaves = [];
      collectLeaves(v, leaves, { left: 2 * MAX_CONTENT_BYTES }, 0);
      if (leaves.length > 0) return leaves.join('\n');
    }
  }
  return null;
}

/**
 * Workspace-relative posix path of a tool input path, or null when it leaves the workspace.
 * @param {string} raw
 * @param {string} root
 * @returns {string | null}
 */
function relativeInWorkspace(raw, root) {
  if (raw === '' || raw.includes('\0')) return null;
  const abs = nodePath.resolve(root, raw);
  const rel = nodePath.relative(nodePath.resolve(root), abs);
  if (rel === '' || rel === '..' || rel.startsWith(`..${nodePath.sep}`) || nodePath.isAbsolute(rel)) return null;
  return rel.split(nodePath.sep).join('/');
}

/**
 * The URL without userinfo (user name and password).
 * @param {string} raw
 * @returns {string}
 */
export function stripUserinfo(raw) {
  try {
    const u = new URL(raw);
    u.username = '';
    u.password = '';
    return u.href;
  } catch {
    return raw.replace(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/?#]*@/, '$1');
  }
}

/**
 * @param {Record<string, unknown>} input
 * @param {readonly string[]} fields
 * @returns {string | null}
 */
function firstString(input, fields) {
  for (const f of fields) {
    if (Object.hasOwn(input, f) && typeof input[f] === 'string' && input[f] !== '') return /** @type {string} */ (input[f]);
  }
  return null;
}

/**
 * Apply the content skips (size, canary) and build the record.
 * @param {ProvenanceRecord['kind']} kind
 * @param {string} source
 * @param {string} content
 * @param {BuildContext} ctx
 * @returns {BuildResult}
 */
function finish(kind, source, content, ctx) {
  if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) return { skip: 'too-large' };
  if (containsCanary(`${source}\n${content}`, ctx.canaries)) return { skip: 'canary' };
  const record = { source, kind, content };
  // The stored line must fit the record cap too (JSON escapes make it longer than the text).
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > MAX_CONTENT_BYTES) return { skip: 'too-large' };
  return { record };
}

/**
 * Build the provenance record of a Post Tool Use event, or say why there is none.
 * @param {Record<string, unknown>} event A parsed PostToolUse event with string `tool_name` and object `tool_input`.
 * @param {BuildContext} ctx
 * @returns {Promise<BuildResult>}
 */
export async function buildProvenanceRecord(event, ctx) {
  const toolName = typeof event['tool_name'] === 'string' ? event['tool_name'] : '';
  const input =
    typeof event['tool_input'] === 'object' && event['tool_input'] !== null && !Array.isArray(event['tool_input'])
      ? /** @type {Record<string, unknown>} */ (event['tool_input'])
      : {};

  if (FILE_READ_TOOLS.includes(toolName)) {
    const raw = firstString(input, ['path', 'file_path']);
    if (raw === null) return { skip: 'unknown-tool' };
    const rel = relativeInWorkspace(raw, ctx.root);
    if (rel === null) return { skip: 'outside-workspace' };
    // The secret check comes first, so nothing about a secret file is read or written.
    const shown = normalizePath(rel);
    const m = ctx.secretMatcher.test(shown);
    if (m.matched) return { skip: 'secret-path' };
    if (m.escapes) return { skip: 'outside-workspace' };

    let content = responseText(event);
    if (content === null) {
      const read = ctx.readFile;
      if (read === undefined) return { skip: 'no-content' };
      content = await read(nodePath.join(nodePath.resolve(ctx.root), rel), MAX_CONTENT_BYTES + 1);
      if (content === null) return { skip: 'no-content' };
    }
    return finish('file', rel, content, ctx);
  }

  if (WEB_TOOLS.includes(toolName)) {
    const url = firstString(input, ['url']);
    if (url === null) return { skip: 'unknown-tool' };
    const content = responseText(event);
    if (content === null) return { skip: 'no-content' };
    return finish('web', stripUserinfo(url), content, ctx);
  }

  if (toolName.startsWith('mcp_') && !isOwnServerTool(toolName)) {
    const content = responseText(event);
    if (content === null) return { skip: 'no-content' };
    return finish('other', `mcp:${toolName}`, content, ctx);
  }

  return { skip: 'unknown-tool' };
}
