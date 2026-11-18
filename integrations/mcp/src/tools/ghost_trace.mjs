// Tool `ghost_trace` (Requirements 19.5, 19.6): trace the destinations of a stored run back to the
// text the agent read. Literal occurrences only; it changes no verdict.
import fsp from 'node:fs/promises';
import { collectNeedles, traceRedThread } from '@ghost-run/core';
import { readProvenance, readRunRecord, sessionKey, storePaths } from '@ghost-run/kiro-hook';
import { defineTool } from '../tool-kit.mjs';
import { errorResult, makeResult } from '../result.mjs';

export const NO_PROVENANCE_TEXT = 'No provenance recorded.';
export const TRACE_NOTE =
  'The red thread finds literal occurrences only. A not-found link does not mean the destination is safe. This tool changes no verdict.';

export const GHOST_TRACE_DESCRIPTION =
  'Read-only. For an earlier ghost_run (Run_Id or Grave_Id), find where each destination or path of the run appears in the text ' +
  'the agent read in a session (Provenance_Log; the most recently modified session when "session" is absent). ' +
  'Advisory: literal occurrences only, "not-found" does not mean safe, and no verdict is changed.';

/**
 * Name of the most recently modified session folder (ties break on the name), or undefined.
 * @param {string} sessionsDir
 * @returns {Promise<string | undefined>}
 */
async function latestSession(sessionsDir) {
  /** @type {string[]} */
  let names;
  try {
    names = await fsp.readdir(sessionsDir);
  } catch {
    return undefined;
  }
  /** @type {{ name: string, mtimeMs: number } | undefined} */
  let best;
  for (const name of names.sort()) {
    try {
      const st = await fsp.lstat(`${sessionsDir}/${name}`);
      if (st.isDirectory() && (best === undefined || st.mtimeMs > best.mtimeMs)) best = { name, mtimeMs: st.mtimeMs };
    } catch {
      // Entry vanished: ignore.
    }
  }
  return best?.name;
}

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server @param {import('../tool-kit.mjs').ToolContext} ctx */
export function register(server, ctx) {
  defineTool(server, ctx, 'ghost_trace', GHOST_TRACE_DESCRIPTION, async (/** @type {{ id: string, session?: string }} */ args, c) => {
    const record = await readRunRecord(c.root, args.id);
    if (record === null) return errorResult('unknown run id');
    const needles = collectNeedles(record.report);
    const key = args.session !== undefined ? sessionKey(args.session) : await latestSession(storePaths(c.root).sessions);
    /** @type {import('@ghost-run/core').ProvenanceLog} */
    let log = [];
    if (key !== undefined) {
      try {
        log = (await readProvenance(c.root, key)).log;
      } catch {
        log = [];
      }
    }
    const provenanceFound = log.length > 0;
    const links = traceRedThread(log, needles);
    const note = provenanceFound ? TRACE_NOTE : `${NO_PROVENANCE_TEXT} ${TRACE_NOTE}`;
    return makeResult(
      { runId: record.runId, ...(key !== undefined ? { session: key } : {}), needles, links, note, provenanceFound },
      {
        text: [
          provenanceFound ? `${links.length} link(s) for ${needles.length} needle(s).` : NO_PROVENANCE_TEXT,
          note,
          JSON.stringify(links, null, 2),
        ].join('\n'),
      },
    );
  });
}
