// Node-only adapter: reads files and calls the pure scanner. Never writes, renames, or deletes.
// No literal hidden character appears here.

import { readFile as fsReadFile } from 'node:fs/promises';
import { buildReport, scanTexts } from './src/possession/entry.js';
import type {
  BlacklightReport,
  FileScan,
  ScanEntryOptions,
} from './src/possession/types.js';

export interface ScanFilesOptions extends ScanEntryOptions {
  /** Injected for tests. Defaults to node:fs/promises readFile. Must return raw bytes. */
  readonly readFile?: (path: string) => Promise<Uint8Array>;
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'unreadable';
}

/**
 * Scan files in order. A file that cannot be read gets an error entry and the
 * remaining paths are still scanned. The BOM is kept so it can be flagged.
 */
export async function scanFiles(
  paths: readonly string[],
  options?: ScanFilesOptions,
): Promise<BlacklightReport> {
  const read = options?.readFile ?? ((p: string): Promise<Uint8Array> => fsReadFile(p));
  const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
  const entryOptions: ScanEntryOptions =
    options?.markdown === undefined ? {} : { markdown: options.markdown };
  const files: FileScan[] = [];
  for (const path of paths) {
    let bytes: Uint8Array;
    try {
      bytes = await read(path);
    } catch (error) {
      files.push({ path, findings: [], error: `cannot read ${path}: ${errorCode(error)}` });
      continue;
    }
    const scanned = scanTexts([{ path, text: decoder.decode(bytes) }], entryOptions);
    files.push(scanned.files[0] as FileScan);
  }
  return buildReport(files);
}
