// Example tests for lib/event.mjs (task 5.1).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CODE_READ_ONLY_OPERATIONS,
  NOT_RECOGNIZED_MESSAGE,
  classifyTool,
  parseHookEvent,
} from '../lib/event.mjs';
import { makeHookEvent } from './fixtures/index.mjs';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/code-tool-operations.json', import.meta.url), 'utf8'),
);

describe('parseHookEvent', () => {
  const base = makeHookEvent('execute_bash', { command: 'ls' });

  it('accepts a valid event', () => {
    const r = parseHookEvent(JSON.stringify(base));
    expect(r).toEqual({ ok: true, event: base });
  });

  it.each([
    ['not json', 'nope', 'stdin'],
    ['array', '[]', 'stdin'],
    ['wrong event name', JSON.stringify({ ...base, hook_event_name: 'PostToolUse' }), 'hook_event_name'],
    ['missing cwd', JSON.stringify({ ...base, cwd: undefined }), 'cwd'],
    ['numeric session_id', JSON.stringify({ ...base, session_id: 1 }), 'session_id'],
    ['missing tool_name', JSON.stringify({ ...base, tool_name: undefined }), 'tool_name'],
    ['null tool_input', JSON.stringify({ ...base, tool_input: null }), 'tool_input'],
    ['array tool_input', JSON.stringify({ ...base, tool_input: [] }), 'tool_input'],
  ])('rejects %s', (_label, text, field) => {
    expect(parseHookEvent(text)).toEqual({ ok: false, field });
  });

  it('keeps a __proto__ key as an own property without touching the prototype', () => {
    const text = '{"hook_event_name":"PreToolUse","cwd":"/w","session_id":"s","tool_name":"x","tool_input":{"__proto__":{"polluted":true},"a":1}}';
    const r = parseHookEvent(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.getPrototypeOf(r.event.tool_input)).toBe(Object.prototype);
    expect(Object.hasOwn(r.event.tool_input, '__proto__')).toBe(true);
    expect(/** @type {any} */ ({}).polluted).toBeUndefined();
  });
});

describe('classifyTool', () => {
  it('execute_bash is shell and exposes only the command', () => {
    const c = classifyTool(makeHookEvent('execute_bash', { command: 'ls', description: 'x', timeout: 5 }));
    expect(c).toEqual({ class: 'shell', targets: [], texts: [], command: 'ls' });
  });

  it('execute_bash without a string command is denied', () => {
    expect(classifyTool(makeHookEvent('execute_bash', { command: 3 })).class).toBe('deny');
  });

  it('fs_write reads path and text', () => {
    expect(classifyTool(makeHookEvent('fs_write', { path: 'a.txt', text: 'hi' }))).toEqual({
      class: 'write', targets: ['a.txt'], texts: ['hi'],
    });
  });

  it('fs_append reads path and text', () => {
    expect(classifyTool(makeHookEvent('fs_append', { path: 'a.txt', text: 'more' }))).toEqual({
      class: 'write', targets: ['a.txt'], texts: ['more'],
    });
  });

  it('str_replace reads path and newStr only', () => {
    const c = classifyTool(makeHookEvent('str_replace', { path: 'a.txt', oldStr: 'o', newStr: 'n' }));
    expect(c).toEqual({ class: 'write', targets: ['a.txt'], texts: ['n'] });
  });

  it('delete_file reads targetFile', () => {
    const c = classifyTool(makeHookEvent('delete_file', { targetFile: 'a.txt', explanation: 'why' }));
    expect(c).toEqual({ class: 'write', targets: ['a.txt'], texts: [] });
  });

  it('a present target field on a tool that does not list it is read too', () => {
    const c = classifyTool(makeHookEvent('fs_write', { path: 'a', text: 't', targetFile: 'b', file_path: 'c' }));
    expect(c.class).toBe('write');
    expect(c.targets).toEqual(['a', 'b', 'c']);
  });

  it('a write tool with only an unlisted target field is still judged on it', () => {
    const c = classifyTool(makeHookEvent('delete_file', { file_path: 'x' }));
    expect(c).toMatchObject({ class: 'write', targets: ['x'] });
  });

  it('a write tool without a target is denied with the exact message', () => {
    const c = classifyTool(makeHookEvent('fs_write', { text: 't' }));
    expect(c.class).toBe('deny');
    expect(c.reason).toBe(NOT_RECOGNIZED_MESSAGE);
    expect(NOT_RECOGNIZED_MESSAGE).toBe('tool or input not recognized by the gate: not allowed.');
  });

  it('an empty or non-string target is denied', () => {
    expect(classifyTool(makeHookEvent('fs_write', { path: '', text: 't' })).class).toBe('deny');
    expect(classifyTool(makeHookEvent('fs_write', { path: 5, text: 't' })).class).toBe('deny');
    expect(classifyTool(makeHookEvent('fs_write', { path: 'a', targetFile: null, text: 't' })).class).toBe('deny');
  });

  it('unknown tools are denied, including read_file and tool_load', () => {
    /** @type {Array<[string, Record<string, unknown>]>} */
    const cases = [
      ['read_file', { path: 'a', offset: 0, limit: 10 }],
      ['tool_load', { tool_ids: ['x'] }],
      ['constructor', {}],
      ['__proto__', {}],
    ];
    for (const [tool, input] of cases) {
      const c = classifyTool(makeHookEvent(tool, input));
      expect(c.class).toBe('deny');
      expect(c.reason).toBe(NOT_RECOGNIZED_MESSAGE);
    }
  });

  it('code: read-only operations are read-only (observed field shapes)', () => {
    expect(classifyTool(makeHookEvent('code', { file_path: 'a.ts', operation: 'get_document_symbols' })).class).toBe('read-only');
    expect(classifyTool(makeHookEvent('code', { operation: 'search_symbols', symbol_name: 'foo' })).class).toBe('read-only');
  });

  it('code: a writing operation with a file target is write and reads the text fields', () => {
    const c = classifyTool(makeHookEvent('code', {
      operation: 'rename_symbol', file_path: 'a.ts', path: 'src', new_name: 'bar', replacement: 'r',
    }));
    expect(c).toEqual({ class: 'write', targets: ['a.ts', 'src'], texts: ['r', 'bar'] });
  });

  it('code: missing or non-string operation is write, and needs a target', () => {
    expect(classifyTool(makeHookEvent('code', { file_path: 'a.ts' })).class).toBe('write');
    expect(classifyTool(makeHookEvent('code', { operation: 7, file_path: 'a.ts' })).class).toBe('write');
    expect(classifyTool(makeHookEvent('code', { operation: 'format_code' })).class).toBe('deny');
    expect(classifyTool(makeHookEvent('code', {})).class).toBe('deny');
  });

  it('code: a directory in path is carried as a target (the write judgment rejects directories)', () => {
    const c = classifyTool(makeHookEvent('code', { operation: 'rename_symbol', path: 'src/' }));
    expect(c).toMatchObject({ class: 'write', targets: ['src/'] });
  });
});

describe('code tool operation fixture', () => {
  it('read-only set equals the fixture read-only list', () => {
    expect([...CODE_READ_ONLY_OPERATIONS].sort()).toEqual([...fixture.readOnly].sort());
  });

  it('read-only plus writing equals the recorded 14 operations', () => {
    expect(fixture.operations).toHaveLength(14);
    expect([...fixture.readOnly, ...fixture.writing].sort()).toEqual([...fixture.operations].sort());
    expect([...fixture.writing].sort()).toEqual(['format_code', 'pattern_rewrite', 'rename_symbol']);
  });

  it('every writing operation is classified write, every other operation read-only', () => {
    for (const op of fixture.operations) {
      const c = classifyTool(makeHookEvent('code', { operation: op, file_path: 'a.ts' }));
      expect(c.class).toBe(fixture.writing.includes(op) ? 'write' : 'read-only');
    }
  });
});
