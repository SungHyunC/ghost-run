// Hook event parsing and tool classification (pure; no I/O, no LLM calls).
// The table follows design.md, "Tool classification". The `code` tool facts
// come from the Kiro CLI 3.4.0 probe only (IDE result pending, task 1.4).

/**
 * @typedef {{
 *   hook_event_name: string,
 *   cwd: string,
 *   session_id: string,
 *   tool_name: string,
 *   tool_input: Record<string, unknown>,
 * }} HookEvent
 */
/** @typedef {'shell' | 'write' | 'read-only' | 'deny'} ToolClass */
/**
 * @typedef {{
 *   class: ToolClass,
 *   targets: string[],
 *   texts: string[],
 *   command?: string,
 *   reason?: string,
 * }} Classification
 */

/** Exact message for every fail-closed classification. */
export const NOT_RECOGNIZED_MESSAGE = 'tool or input not recognized by the gate: not allowed.';

/** Every Target_Path_Field, read on every tool when present. */
export const TARGET_PATH_FIELDS = Object.freeze(['path', 'targetFile', 'file_path']);

const REQUIRED_FIELDS = /** @type {const} */ (['cwd', 'session_id', 'tool_name']);

/**
 * Parse the STDIN text of a Pre Tool Use event.
 * @param {string} text
 * @returns {{ ok: true, event: HookEvent } | { ok: false, field: string }}
 */
export function parseHookEvent(text) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, field: 'stdin' };
  }
  if (!isPlainObject(raw)) return { ok: false, field: 'stdin' };
  const name = ownString(raw, 'hook_event_name');
  if (name !== 'PreToolUse') return { ok: false, field: 'hook_event_name' };
  /** @type {Record<string, string>} */
  const strings = {};
  for (const f of REQUIRED_FIELDS) {
    const v = ownString(raw, f);
    if (v === undefined) return { ok: false, field: f };
    strings[f] = v;
  }
  const input = Object.hasOwn(raw, 'tool_input') ? raw['tool_input'] : undefined;
  if (!isPlainObject(input)) return { ok: false, field: 'tool_input' };
  /** @type {Record<string, unknown>} */
  const toolInput = {};
  for (const key of Object.keys(input)) {
    // defineProperty never triggers the __proto__ setter.
    Object.defineProperty(toolInput, key, {
      value: input[key],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return {
    ok: true,
    event: {
      hook_event_name: 'PreToolUse',
      cwd: /** @type {string} */ (strings['cwd']),
      session_id: /** @type {string} */ (strings['session_id']),
      tool_name: /** @type {string} */ (strings['tool_name']),
      tool_input: toolInput,
    },
  };
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string} key
 * @returns {string | undefined}
 */
function ownString(obj, key) {
  if (!Object.hasOwn(obj, key)) return undefined;
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * @typedef {{
 *   class: 'shell' | 'write',
 *   targetFields: readonly string[],
 *   textFields: readonly string[],
 * }} ToolEntry
 */

/** @type {Readonly<Record<string, ToolEntry>>} */
export const TOOL_TABLE = Object.freeze({
  execute_bash: { class: 'shell', targetFields: [], textFields: [] },
  fs_write: { class: 'write', targetFields: ['path'], textFields: ['text'] },
  fs_append: { class: 'write', targetFields: ['path'], textFields: ['text'] },
  str_replace: { class: 'write', targetFields: ['path'], textFields: ['newStr'] },
  // Unobserved in the Kiro CLI 3.4.0 default agent; kept per the design table.
  delete_file: { class: 'write', targetFields: ['targetFile'], textFields: [] },
  // `code` is write or read-only depending on `operation`; see classifyTool.
  code: {
    class: 'write',
    targetFields: ['file_path', 'path'],
    textFields: ['replacement', 'new_name'],
  },
});

/** Read-only `code` operations (CLI 3.4.0 probe: 14 operations, 11 read-only). */
export const CODE_READ_ONLY_OPERATIONS = Object.freeze(
  new Set([
    'search_symbols',
    'lookup_symbols',
    'get_document_symbols',
    'generate_codebase_overview',
    'search_codebase_map',
    'pattern_search',
    'goto_definition',
    'find_references',
    'hover',
    'completion',
    'diagnostics',
  ]),
);

/**
 * @param {string} reason
 * @returns {Classification}
 */
function deny(reason = NOT_RECOGNIZED_MESSAGE) {
  return { class: 'deny', targets: [], texts: [], reason };
}

/**
 * Classify a parsed event. Fails closed: an unknown tool, a non-string
 * target or text field, or a write tool without a usable target is `deny`.
 * @param {HookEvent} event
 * @returns {Classification}
 */
export function classifyTool(event) {
  const name = event.tool_name;
  if (!Object.hasOwn(TOOL_TABLE, name)) return deny();
  const entry = /** @type {ToolEntry} */ (TOOL_TABLE[name]);
  const input = event.tool_input;

  // Listed fields first, then any other Target_Path_Field that is present.
  const order = [...entry.targetFields, ...TARGET_PATH_FIELDS.filter((f) => !entry.targetFields.includes(f))];
  /** @type {string[]} */
  const targets = [];
  for (const field of order) {
    if (!Object.hasOwn(input, field)) continue;
    const v = input[field];
    if (typeof v !== 'string') return deny();
    if (v !== '') targets.push(v);
  }

  /** @type {string[]} */
  const texts = [];
  for (const field of entry.textFields) {
    if (!Object.hasOwn(input, field)) continue;
    const v = input[field];
    if (typeof v !== 'string') return deny();
    texts.push(v);
  }

  if (name === 'execute_bash') {
    const command = Object.hasOwn(input, 'command') ? input['command'] : undefined;
    if (typeof command !== 'string') return deny();
    return { class: 'shell', targets, texts, command };
  }

  if (name === 'code') {
    const op = Object.hasOwn(input, 'operation') ? input['operation'] : undefined;
    if (typeof op === 'string' && CODE_READ_ONLY_OPERATIONS.has(op)) {
      return { class: 'read-only', targets, texts };
    }
  }

  if (targets.length === 0) return deny();
  return { class: 'write', targets, texts };
}
