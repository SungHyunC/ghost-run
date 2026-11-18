import { readFile, stat } from 'node:fs/promises';
import { MAX_INPUT_BYTES, parseWards } from './parse.js';
import type { ParseResult } from './types.js';

function unreadable(path: string): ParseResult {
  return {
    ok: false,
    errors: [{ code: 'file-unreadable', message: `cannot read wards file: ${path}` }],
  };
}

/**
 * Reads a wards file and parses it. Node entry only (decision D21).
 * stat first: a file over the cap is rejected without being read.
 */
export async function loadWardsFile(path: string): Promise<ParseResult> {
  let bytes: Uint8Array;
  try {
    const info = await stat(path);
    if (info.size > MAX_INPUT_BYTES) {
      return {
        ok: false,
        errors: [
          {
            code: 'input-too-large',
            message: `wards file is larger than ${MAX_INPUT_BYTES} bytes: ${path}`,
          },
        ],
      };
    }
    bytes = await readFile(path);
  } catch {
    return unreadable(path);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      errors: [{ code: 'file-unreadable', message: `wards file is not valid UTF-8: ${path}` }],
    };
  }
  return parseWards(text);
}
