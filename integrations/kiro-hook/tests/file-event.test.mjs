import { describe, expect, it } from 'vitest';
import { extractFilePath } from '../lib/file-event.mjs';
import {
  FILE_CREATE_TRIGGER,
  FILE_EVENT_PATH_FIELDS,
  POST_RESPONSE_FIELDS,
} from '../gate-config.mjs';

const ROOT = '/work/repo';
const base = { cwd: ROOT, hook_event_name: 'PostFileCreate', session_id: 's-1' };

describe('file-event constants (CLI 3.4.0)', () => {
  it('holds the recorded values', () => {
    expect(FILE_EVENT_PATH_FIELDS).toEqual(['file_path']);
    expect(FILE_CREATE_TRIGGER).toBe('PostFileCreate');
    expect(POST_RESPONSE_FIELDS).toEqual(['tool_response']);
  });
});

describe('extractFilePath', () => {
  it('makes an absolute path relative to the root', () => {
    expect(extractFilePath({ ...base, file_path: '/work/repo/worlds/demo/world.ts' }, ROOT)).toBe(
      'worlds/demo/world.ts',
    );
  });
  it('accepts a relative path and a root with a trailing slash', () => {
    expect(extractFilePath({ ...base, file_path: 'core/src/a.ts' }, ROOT)).toBe('core/src/a.ts');
    expect(extractFilePath({ ...base, file_path: './core/a.ts' }, `${ROOT}/`)).toBe('core/a.ts');
  });
  it('returns null for a path outside the workspace', () => {
    expect(extractFilePath({ ...base, file_path: '/work/other/a.ts' }, ROOT)).toBeNull();
    expect(extractFilePath({ ...base, file_path: '/work/repo-evil/a.ts' }, ROOT)).toBeNull();
  });
  it('returns null for a path with .. after normalization', () => {
    expect(extractFilePath({ ...base, file_path: '../x/a.ts' }, ROOT)).toBeNull();
    expect(extractFilePath({ ...base, file_path: '/work/repo/../x/a.ts' }, ROOT)).toBeNull();
    expect(extractFilePath({ ...base, file_path: 'a/../../b' }, ROOT)).toBeNull();
  });
  it('normalizes an inner .. that stays inside the workspace', () => {
    expect(extractFilePath({ ...base, file_path: 'a/b/../c.ts' }, ROOT)).toBe('a/c.ts');
  });
  it('returns null for a missing, empty, or non-string field and bad events', () => {
    expect(extractFilePath(base, ROOT)).toBeNull();
    expect(extractFilePath({ ...base, file_path: '' }, ROOT)).toBeNull();
    expect(extractFilePath({ ...base, file_path: 5 }, ROOT)).toBeNull();
    expect(extractFilePath({ ...base, file_path: ROOT }, ROOT)).toBeNull();
    expect(extractFilePath(null, ROOT)).toBeNull();
    expect(extractFilePath({ ...base, file_path: 'a.ts' }, 'relative/root')).toBeNull();
  });
});
