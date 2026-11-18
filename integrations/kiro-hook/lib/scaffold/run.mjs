// Hook body of world-scaffold: STDIN text in, summary text out, record file written.
// Never throws and never blocks: a file-event hook cannot undo a file creation.

import { FILE_CREATE_TRIGGER } from '../../gate-config.mjs';
import { extractFilePath } from '../file-event.mjs';
import { storePaths, storeWriteFile } from '../store/ghost-store.mjs';
import { scaffoldWorld } from './scaffold.mjs';
import path from 'node:path';
import { realpathSync } from 'node:fs';

/** Record file of the last scaffold that did something, relative to the Ghost_Store folder. */
export const RECORD_NAME = path.join('scaffold', 'last.json');

/**
 * @param {string} stdinText
 * @param {string} root absolute workspace root
 * @returns {Promise<{ stdout: string, result: import('./scaffold.mjs').ScaffoldResult }>}
 */
export async function runScaffold(stdinText, root) {
  /** @type {import('./scaffold.mjs').ScaffoldResult} */
  const ignored = { status: 'ignored', created: [], existing: [], message: '' };
  /** @type {unknown} */
  let event;
  try {
    event = JSON.parse(stdinText);
  } catch {
    return { stdout: '', result: ignored };
  }
  // Only the create trigger scaffolds. Other names (a following PostFileSave) are a no-op.
  const trigger = /** @type {Record<string, unknown> | null} */ (event)?.hook_event_name;
  if (typeof trigger === 'string' && trigger !== FILE_CREATE_TRIGGER) {
    return { stdout: '', result: ignored };
  }
  let rel = extractFilePath(event, root);
  let useRoot = root;
  if (rel === null) {
    // The host may report a path through a symbolic link (for example /tmp on macOS) while the
    // process folder is the resolved one. Retry once with both sides resolved.
    try {
      const real = realpathSync(root);
      const raw = /** @type {Record<string, unknown> | null} */ (event)?.file_path;
      if (typeof raw === 'string' && raw !== '') {
        const abs = path.isAbsolute(raw) ? raw : path.join(root, raw);
        rel = extractFilePath({ file_path: realpathSync(abs) }, real);
        useRoot = real;
      }
    } catch {
      rel = null;
    }
  }
  const result = await scaffoldWorld(useRoot, rel);
  // A no-op keeps the record of the earlier run that created the files.
  if (result.status === 'ignored' || result.status === 'noop') {
    return { stdout: result.message === '' ? '' : `${result.message}\n`, result };
  }
  const record = JSON.stringify({
    status: result.status,
    name: result.name ?? null,
    path: rel,
    created: result.created,
    existing: result.existing,
    message: result.message,
  });
  await storeWriteFile(path.join(storePaths(useRoot).dir, RECORD_NAME), `${record}\n`, []);
  return { stdout: `${result.message}\n`, result };
}
