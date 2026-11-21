// MCP server `ghost-run`: five advisory tools over stdio. STDOUT is protocol only.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_NAMES } from './schemas.mjs';
import { createWorkspaceResolver, localRoots, ownFolderOf } from './workspace.mjs';
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

/** Longest wait for the client's answer to roots/list. */
const ROOTS_TIMEOUT_MS = 5000;

/**
 * @param {{
 *   root?: string,
 *   env?: Record<string, string | undefined>,
 *   deps?: Record<string, any>,
 *   stderr?: (line: string) => void,
 *   workspace?: Partial<import('./workspace.mjs').WorkspaceSources>,
 * }} [options]
 * `root` fixes the workspace root (tests). Otherwise the root is resolved per call (workspace.mjs);
 * `workspace` injects the sources (cwd, own folder, roots) so a test needs no host.
 * deps carries injectable doubles for the tools (for example `runPlan`, `storeDir`).
 */
export function createServer(options = {}) {
  const stderr = options.stderr ?? ((/** @type {string} */ line) => { process.stderr.write(`${line}\n`); });
  const env = options.env ?? process.env;
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const getRoots = async () => {
    if (!server.server.getClientCapabilities()?.roots) return null;
    const answer = await server.server.listRoots(undefined, { timeout: ROOTS_TIMEOUT_MS });
    return localRoots(answer.roots);
  };
  const resolver = createWorkspaceResolver({
    env,
    cwd: () => process.cwd(),
    ownDir: ownFolderOf(import.meta.url),
    getRoots,
    ...options.workspace,
  });
  server.server.setNotificationHandler(RootsListChangedNotificationSchema, () => {
    resolver.invalidate();
  });
  /** @type {import('./tool-kit.mjs').ToolContext} */
  const ctx = {
    root: options.root ?? '',
    env,
    deps: options.deps ?? {},
    log: (message) => stderr(`[ghost-run-mcp] ${message}`),
    notices: [],
    ...(options.root === undefined ? { resolveRoot: (workspace) => resolver.resolve(workspace) } : {}),
  };
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
