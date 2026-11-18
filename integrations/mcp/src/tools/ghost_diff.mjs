// Tool `ghost_diff` (Requirement 19, criterion 4): the stored changes of one run, per step.
import { diffSummary, readRunRecord } from '@ghost-run/kiro-hook';
import { defineTool } from '../tool-kit.mjs';
import { errorResult, makeResult } from '../result.mjs';

export const UNKNOWN_RUN_ID = 'unknown run id';

export const GHOST_DIFF_DESCRIPTION =
  'Read-only. Return the stored changes (per step), the diff summary, and the isolation claims of an earlier ghost_run, ' +
  'by Run_Id or Grave_Id. Advisory: it reports stored data and says nothing about whether a command is safe. ' +
  'An unknown or removed id gives "unknown run id".';

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server @param {import('../tool-kit.mjs').ToolContext} ctx */
export function register(server, ctx) {
  defineTool(server, ctx, 'ghost_diff', GHOST_DIFF_DESCRIPTION, async (/** @type {{ id: string }} */ args, c) => {
    const record = await readRunRecord(c.root, args.id);
    if (record === null) return errorResult(UNKNOWN_RUN_ID);
    const iso = record.isolation;
    const steps = Array.isArray(record.report?.changes) ? record.report.changes : [];
    return makeResult({
      runId: record.runId,
      steps,
      diffSummary: diffSummary(steps),
      isolation: {
        mode: iso?.mode,
        p1Claimed: iso?.p1Claimed === true,
        p5Claimed: iso?.p5Claimed === true,
        p6Claimed: iso?.p6Claimed === true,
      },
    });
  });
}
