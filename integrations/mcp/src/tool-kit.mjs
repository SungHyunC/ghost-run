// Helper every tool module uses to register itself. Schemas and annotations come
// from schemas.mjs, so a tool file only supplies a description and a handler.
import { sanitizeJudgeText } from '@ghost-run/core';
import { ANNOTATIONS, INPUT_SHAPES, parseInput } from './schemas.mjs';
import { errorResult, invalidInputResult } from './result.mjs';

/**
 * @typedef {typeof import('./schemas.mjs').TOOL_NAMES[number]} ToolName
 * @typedef {{
 *   root: string,
 *   env: Record<string, string | undefined>,
 *   deps: Record<string, any>,
 *   log: (message: string) => void,
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
      try {
        return await handler(parsed.data, ctx);
      } catch (err) {
        ctx.log(`${name} failed: ${sanitizeJudgeText(err instanceof Error ? err.message : String(err), 200)}`);
        return errorResult(`${name} failed`);
      }
    },
  );
}
