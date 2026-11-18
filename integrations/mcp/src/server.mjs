// MCP server `ghost-run`: five advisory tools over stdio. STDOUT is protocol only.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOL_NAMES } from './schemas.mjs';
import { register as registerGhostRun } from './tools/ghost_run.mjs';
import { register as registerGhostDiff } from './tools/ghost_diff.mjs';
import { register as registerGhostTrace } from './tools/ghost_trace.mjs';
import { register as registerWardsCheck } from './tools/wards_check.mjs';
import { register as registerBlacklight } from './tools/blacklight.mjs';

export const SERVER_NAME = 'ghost-run';
export const SERVER_VERSION = '0.0.0';

/** Convention: src/tools/<name>.mjs exports `register(server, ctx)`. */
export const TOOL_REGISTRY = {
  ghost_run: registerGhostRun,
  ghost_diff: registerGhostDiff,
  ghost_trace: registerGhostTrace,
  wards_check: registerWardsCheck,
  blacklight: registerBlacklight,
};

/**
 * @param {{
 *   root?: string,
 *   env?: Record<string, string | undefined>,
 *   deps?: Record<string, any>,
 *   stderr?: (line: string) => void,
 * }} [options]
 * deps carries injectable doubles for the tools (for example `runPlan`, `storeDir`).
 */
export function createServer(options = {}) {
  const stderr = options.stderr ?? ((/** @type {string} */ line) => { process.stderr.write(`${line}\n`); });
  /** @type {import('./tool-kit.mjs').ToolContext} */
  const ctx = {
    root: options.root ?? process.cwd(),
    env: options.env ?? process.env,
    deps: options.deps ?? {},
    log: (message) => stderr(`[ghost-run-mcp] ${message}`),
  };
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  for (const name of TOOL_NAMES) TOOL_REGISTRY[name](server, ctx);
  return { server, ctx };
}

/** Connect to stdio. Nothing but the transport writes to STDOUT. */
export async function startStdioServer(options = {}) {
  const { server, ctx } = createServer(options);
  await server.connect(new StdioServerTransport());
  ctx.log('ready');
  return server;
}
