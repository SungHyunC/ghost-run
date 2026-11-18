// Hook body of blacklight-steering: STDIN text in, report out, record file written.
// A report, not a block: the exit code is exitCodeFor(outcome) (0 clean, 1 findings, 2 error).
// The scanned files are only read. Never writes, renames, or deletes them.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { extractFilePath } from '../file-event.mjs';
import { storePaths, storeWriteFile } from '../store/ghost-store.mjs';

/** Record file of the last report, relative to the Ghost_Store folder. */
export const RECORD_NAME = path.join('blacklight', 'last.txt');

/**
 * @typedef {{ stdout: string, stderr: string, exit: 0 | 1 | 2, ran: boolean }} BlacklightOutcome
 * @typedef {{
 *   scanFiles: (paths: readonly string[], options?: Record<string, unknown>) => Promise<unknown>,
 *   formatReport: (report: any) => string,
 *   exitCodeFor: (outcome: any) => 0 | 1 | 2,
 * }} ScanDeps
 */

/** @returns {Promise<ScanDeps>} */
async function loadDeps() {
  const node = await import('@ghost-run/core/possession-node');
  const core = await import('@ghost-run/core');
  return {
    scanFiles: node.scanFiles,
    formatReport: core.formatReport,
    exitCodeFor: core.exitCodeFor,
  };
}

/**
 * Scan workspace-relative paths, print and record the report.
 * @param {string[]} relPaths
 * @param {string} root absolute workspace root
 * @param {ScanDeps} [deps]
 * @returns {Promise<BlacklightOutcome>}
 */
export async function scanAndReport(relPaths, root, deps) {
  /** @type {ScanDeps} */
  let d;
  try {
    d = deps ?? (await loadDeps());
  } catch {
    return {
      stdout: '',
      stderr: 'blacklight: unavailable: build the packages first (pnpm -r build).\n',
      exit: 2,
      ran: false,
    };
  }
  /** @type {any} */
  const report = await d.scanFiles(relPaths, {
    markdown: 'by-extension',
    readFile: (/** @type {string} */ p) => fsp.readFile(path.join(root, p)),
  });
  const text = `${d.formatReport(report)}\n`;
  const exit = d.exitCodeFor(report.outcome);
  await storeWriteFile(path.join(storePaths(root).dir, RECORD_NAME), text, []);
  return { stdout: text, stderr: report.outcome === 'clean' ? '' : text, exit, ran: true };
}

/**
 * @param {string} stdinText
 * @param {string} root absolute workspace root
 * @param {ScanDeps} [deps]
 * @returns {Promise<BlacklightOutcome>}
 */
export async function runBlacklightHook(stdinText, root, deps) {
  const ignored = { stdout: '', stderr: '', exit: /** @type {const} */ (0), ran: false };
  /** @type {unknown} */
  let event;
  try {
    event = JSON.parse(stdinText);
  } catch {
    return ignored;
  }
  const rel = extractFilePath(event, root);
  if (rel === null || !/^\.kiro\//.test(rel)) return ignored;
  return scanAndReport([rel], root, deps);
}

/**
 * Workspace-relative paths of all regular files under `.kiro/` (links are skipped), sorted.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function listKiroFiles(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} rel */
  async function walk(rel) {
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(child);
      else if (e.isFile()) out.push(child);
    }
  }
  await walk('.kiro');
  return out.sort();
}

/**
 * Scan the whole `.kiro/` folder (the `pnpm blacklight` script).
 * @param {string} root
 * @param {ScanDeps} [deps]
 * @returns {Promise<BlacklightOutcome>}
 */
export async function runBlacklightAll(root, deps) {
  return scanAndReport(await listKiroFiles(root), root, deps);
}
