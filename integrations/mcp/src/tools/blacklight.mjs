// blacklight: scan workspace files for hidden characters. Read-only; every path is confined first.
import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { formatReport } from '@ghost-run/core';
import { scanFiles } from '@ghost-run/core/possession-node';
import { confinePath } from '../confine.mjs';
import { defineTool } from '../tool-kit.mjs';
import { makeResult } from '../result.mjs';

export const MAX_FILES_PER_DIRECTORY = 1000;

const DESCRIPTION =
  'Advisory scan of workspace files for hidden Unicode (tag, zero-width, and bidi characters). Paths outside the workspace are rejected per path. A clean outcome does not mean a file is free of injected instructions.';

/**
 * Collect regular files under a confined directory, without following symbolic links.
 * @param {string} dir real, confined directory
 * @param {{ files: string[], skipped: number, capped: boolean }} acc
 */
async function walk(dir, acc) {
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (acc.capped) return;
    const full = path.join(dir, entry.name);
    let st;
    try {
      st = await lstat(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      acc.skipped += 1;
    } else if (st.isDirectory()) {
      await walk(full, acc);
    } else if (st.isFile()) {
      if (acc.files.length >= MAX_FILES_PER_DIRECTORY) {
        acc.capped = true;
        return;
      }
      acc.files.push(full);
    }
  }
}

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server @param {import('../tool-kit.mjs').ToolContext} ctx */
export function register(server, ctx) {
  defineTool(server, ctx, 'blacklight', DESCRIPTION, async (/** @type {{ path: string[] }} */ args) => {
    let realRoot;
    try {
      realRoot = await realpath(ctx.root);
    } catch {
      realRoot = ctx.root;
    }
    /** @type {{ path: string, error: string }[]} */
    const pathErrors = [];
    /** @type {string[]} */
    const toScan = [];
    const seen = new Set();
    let skippedSymlinks = 0;
    /** @type {string[]} */
    const cappedPaths = [];
    for (const p of args.path) {
      const confined = await confinePath(ctx.root, p);
      if (!confined.ok) {
        pathErrors.push({ path: p, error: confined.error });
        continue;
      }
      let st;
      try {
        st = await lstat(confined.real);
      } catch {
        pathErrors.push({ path: p, error: 'path does not exist or is not readable' });
        continue;
      }
      /** @type {string[]} */
      let found = [];
      if (st.isDirectory()) {
        const acc = { files: /** @type {string[]} */ ([]), skipped: 0, capped: false };
        await walk(confined.real, acc);
        skippedSymlinks += acc.skipped;
        if (acc.capped) cappedPaths.push(p);
        found = acc.files;
      } else if (st.isFile()) {
        found = [confined.real];
      } else {
        pathErrors.push({ path: p, error: 'not a regular file or directory' });
        continue;
      }
      for (const f of found) {
        if (!seen.has(f)) {
          seen.add(f);
          toScan.push(f);
        }
      }
    }

    const scanned = await scanFiles(toScan);
    const rel = (/** @type {string} */ p) => path.relative(realRoot, p).split(path.sep).join('/') || '.';
    const files = scanned.files.map((f) => ({
      ...f,
      path: rel(f.path),
      ...(f.error !== undefined ? { error: f.error.split(f.path).join(rel(f.path)) } : {}),
    }));
    const hasError = pathErrors.length > 0 || files.some((f) => f.error !== undefined);
    const outcome = hasError ? 'error' : scanned.totalFindings > 0 ? 'findings' : 'clean';
    const report = { outcome, files, totalFindings: scanned.totalFindings };
    const extra = [
      ...pathErrors.map((e) => `${e.path}: error ${e.error}`),
      ...(skippedSymlinks > 0 ? [`skipped ${skippedSymlinks} symbolic link(s)`] : []),
      ...(cappedPaths.length > 0 ? [`file cap of ${MAX_FILES_PER_DIRECTORY} reached for: ${cappedPaths.join(', ')}`] : []),
    ];
    const text = [formatReport(/** @type {any} */ (report)), ...extra].join('\n');
    return makeResult(
      {
        outcome,
        files,
        totalFindings: scanned.totalFindings,
        text,
        pathErrors,
        skippedSymlinks,
        capped: cappedPaths.length > 0,
        cap: MAX_FILES_PER_DIRECTORY,
      },
      { text },
    );
  });
}
