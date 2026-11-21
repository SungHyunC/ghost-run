// Helper every tool module uses to register itself. Schemas and annotations come
// from schemas.mjs, so a tool file only supplies a description and a handler.
import { sanitizeJudgeText } from '@ghost-run/core';
import { ANNOTATIONS, INPUT_SHAPES, parseInput } from './schemas.mjs';
import { errorResult, invalidInputResult, truncateText } from './result.mjs';
import { realpathSync } from 'node:fs';
import { WORKSPACE_MISMATCH_MESSAGE } from './workspace.mjs';

/**
 * @typedef {typeof import('./schemas.mjs').TOOL_NAMES[number]} ToolName
 * @typedef {{
 *   root: string,
 *   env: Record<string, string | undefined>,
 *   deps: Record<string, any>,
 *   log: (message: string) => void,
 *   notices: string[],
 *   resolveRoot?: (workspace?: string) => Promise<import('./workspace.mjs').RootResult>,
 * }} ToolContext
 * @typedef {(args: any, ctx: ToolContext) => Promise<any> | any} ToolHandler
 */

/**
 * Cut command text for diagnostics to 120 code points, hidden characters escaped.
 * @param {string} command
 */
export function cutCommand(command) {
  return sanitizeJudgeText(String(command), 120);
}

/**
 * A server with a fixed root (tests): a `workspace` input must name the same folder.
 * @param {string} root
 * @param {string | undefined} workspace
 * @returns {{ ok: true, root: string } | { ok: false, error: string }}
 */
function fixedRoot(root, workspace) {
  if (workspace === undefined) return { ok: true, root };
  try {
    if (realpathSync(workspace) === realpathSync(root)) return { ok: true, root };
  } catch {
    // fall through to the mismatch error
  }
  return { ok: false, error: WORKSPACE_MISMATCH_MESSAGE };
}

/**
 * Register one tool. The wrapper validates the input again (the runner is never
 * called on invalid input) and turns a thrown error into an error result.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {ToolContext} ctx
 * @param {ToolName} name
 * @param {string} description
 * @param {ToolHandler} handler
 */
export function defineTool(server, ctx, name, description, handler) {
  /** @type {any} */ (server).registerTool(
    name,
    { description, inputSchema: INPUT_SHAPES[name], annotations: ANNOTATIONS[name] },
    async (/** @type {unknown} */ args) => {
      const parsed = parseInput(name, args);
      if (!parsed.ok) return invalidInputResult(parsed.field, parsed.message);
      const found = ctx.resolveRoot ? await ctx.resolveRoot(parsed.data.workspace) : fixedRoot(ctx.root, parsed.data.workspace);
      if (!found.ok) return errorResult(found.error);
      /** @type {ToolContext} */
      const callCtx = { ...ctx, root: found.root, notices: [] };
      /** @type {any} */
      let result;
      try {
        result = await handler(parsed.data, callCtx);
      } catch (err) {
        ctx.log(`${name} failed: ${sanitizeJudgeText(err instanceof Error ? err.message : String(err), 200)}`);
        result = errorResult(`${name} failed`);
      }
      return withNotices(result, found.root, callCtx.notices);
    },
  );
}

/**
 * Name the resolved root once, and add the notices of the call, as lines before the result text.
 * @param {any} result
 * @param {string} root
 * @param {string[]} notices
 */
export function withNotices(result, root, notices) {
  const lines = [`Workspace root: ${sanitizeJudgeText(root, 400)}`, ...notices.map((n) => sanitizeJudgeText(n, 400))];
  const first = result?.content?.[0];
  if (first && typeof first.text === 'string') first.text = truncateText(`${lines.join('\n')}\n${first.text}`).text;
  if (result && typeof result === 'object') {
    result.structuredContent = { ...(result.structuredContent ?? {}), workspaceRoot: lines[0].slice('Workspace root: '.length), ...(notices.length > 0 ? { notices: lines.slice(1) } : {}) };
  }
  return result;
}
