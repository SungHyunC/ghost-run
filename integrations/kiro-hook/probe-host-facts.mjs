// Probe hook (Requirement 24): records host-event facts (field names, paths,
// content digests) to .ghost-run/probe/events.jsonl. Imports node:fs and
// node:path only. Exit code 0 on every path, except --deny-test, which exits 2
// solely for the fixed command DENY_COMMAND. Makes no network or LLM call.
// Records never contain command text, file content, or response text.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const DENY_COMMAND = 'echo ghost-run-block-probe';
const ASK_COMMAND = 'echo ghost-run-ask-probe';
const STDOUT_MARKER = 'GHOST-PROBE-STDOUT-MARKER';
const CONTENT_FIELD = /text|content|body|command|input|new_?str|old_?str/i;
const PATH_FIELD = /(^|_)(path|file)(name)?$/i;
const NOT_PATH_FIELD = /content|text|body|data/i;
const EXACT_PATH_FIELDS = ['path', 'targetFile', 'file_path'];
const MAX_PATH_LENGTH = 1024;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * @param {string} root
 * @param {string} value
 * @returns {string}
 */
function toRelative(root, value) {
  try {
    const abs = path.resolve(root, value);
    const rel = path.relative(root, abs);
    if (rel === '' ) return '.';
    if (rel.startsWith('..') || path.isAbsolute(rel)) return '<outside>';
    return rel.split(path.sep).join('/');
  } catch {
    return '<outside>';
  }
}

/**
 * @param {string} root
 * @param {Record<string, any>} event
 * @param {Record<string, any> | null} toolInput
 * @returns {string[]}
 */
function collectPaths(root, event, toolInput) {
  /** @type {string[]} */
  const out = [];
  /** @param {unknown} v */
  const add = (v) => {
    if (typeof v === 'string' && v.length > 0 && v.length <= MAX_PATH_LENGTH && !/[\r\n]/.test(v)) out.push(toRelative(root, v));
  };
  for (const name of EXACT_PATH_FIELDS) {
    add(event[name]);
    if (toolInput) add(toolInput[name]);
  }
  for (const [name, value] of Object.entries(event)) {
    if (PATH_FIELD.test(name) && !NOT_PATH_FIELD.test(name) && typeof value === 'string') add(value);
  }
  return [...new Set(out)].sort();
}

/**
 * @param {Record<string, any>} toolInput
 * @returns {Record<string, { len: number, sha256: string }>}
 */
function digestOf(toolInput) {
  /** @type {Record<string, { len: number, sha256: string }>} */
  const digest = {};
  for (const [name, value] of Object.entries(toolInput)) {
    if (typeof value === 'string' && CONTENT_FIELD.test(name)) {
      digest[name] = {
        len: value.length,
        sha256: createHash('sha256').update(value, 'utf8').digest('hex'),
      };
    }
  }
  return digest;
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} record
 */
function append(root, record) {
  try {
    const base = path.join(root, '.ghost-run');
    const dir = path.join(base, 'probe');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const fd = fs.openSync(path.join(dir, 'events.jsonl'), 'a', 0o600);
    try {
      fs.writeSync(fd, JSON.stringify(record) + '\n');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // The probe never fails the host.
  }
}

/**
 * @param {string} root
 * @param {Record<string, any>} event
 * @returns {Record<string, any>}
 */
function buildRecord(root, event) {
  const toolInput = isObject(event.tool_input) ? event.tool_input : null;
  const trigger = typeof event.hook_event_name === 'string' ? event.hook_event_name : null;
  /** @type {Record<string, any>} */
  const record = {
    hook_event_name: trigger,
    fields: Object.keys(event).sort(),
    toolInputFields: toolInput ? Object.keys(toolInput).sort() : [],
    toolName: typeof event.tool_name === 'string' ? event.tool_name : null,
    paths: collectPaths(root, event, toolInput),
  };
  if (toolInput) {
    const digest = digestOf(toolInput);
    if (Object.keys(digest).length > 0) record.tool_input_digest = digest;
  }
  if (trigger === 'PostToolUse') {
    record.objectFields = Object.entries(event)
      .filter(([name, value]) => name !== 'tool_input' && isObject(value))
      .map(([name]) => name)
      .sort();
  }
  return record;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const mode = process.argv[2] ?? '';
  const root = process.cwd();
  /** @type {Record<string, any>} */
  let event = {};
  try {
    const parsed = JSON.parse(readStdin());
    if (isObject(parsed)) event = parsed;
  } catch {
    event = {};
  }
  const record = buildRecord(root, event);
  const toolInput = isObject(event.tool_input) ? event.tool_input : {};
  const command = typeof toolInput.command === 'string' ? toolInput.command.trim() : '';

  if (mode === '--deny-test') {
    if (command === DENY_COMMAND) {
      record.denyTest = 'denied';
      append(root, record);
      process.exitCode = 2;
      return;
    }
  } else if (mode === '--ask-test') {
    if (command === ASK_COMMAND) {
      record.askTest = 'asked';
      append(root, record);
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'probe: ask test' },
        }) + '\n',
      );
      return;
    }
  } else if (mode === '--stdout-test') {
    append(root, { ...record, stdoutTest: 'printed' });
    process.stdout.write(STDOUT_MARKER + '\n');
    return;
  } else if (mode === '--timeout-test=entry' || mode === '--timeout-test=action') {
    const placement = mode.slice('--timeout-test='.length);
    append(root, { ...record, timeoutTest: placement, phase: 'start', at: Date.now() });
    await sleep(3000);
    append(root, { ...record, timeoutTest: placement, phase: 'end', at: Date.now() });
    return;
  }
  append(root, record);
}

main().catch(() => {
  process.exitCode = 0;
});
