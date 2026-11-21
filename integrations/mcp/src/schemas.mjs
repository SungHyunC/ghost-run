// Input schemas and annotations of the five tools (design: MCP server table).
import { z } from 'zod';

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_COMMAND_CODE_POINTS = 4096;
export const MAX_PLAN_ACTIONS = 50;
export const MAX_PATHS = 200;

/** Length in code points, not UTF-16 units. */
const codePoints = (/** @type {string} */ s) => [...s].length;

const action = z.object({
  command: z
    .string()
    .min(1)
    .refine((s) => codePoints(s) <= MAX_COMMAND_CODE_POINTS, {
      message: `must be at most ${MAX_COMMAND_CODE_POINTS} code points`,
    }),
  cwd: z.string().optional(),
});

export const planSchema = z.array(action).min(1).max(MAX_PLAN_ACTIONS);
/** Optional absolute path of the agent's project root; the server validates it (workspace.mjs). */
export const workspaceSchema = z.string().min(1).max(4096).optional();
export const idSchema = z.string().regex(ID_PATTERN);

/** Raw zod shapes, as `registerTool` takes them. */
export const INPUT_SHAPES = {
  ghost_run: { plan: planSchema, workspace: workspaceSchema },
  ghost_diff: { id: idSchema, workspace: workspaceSchema },
  ghost_trace: { id: idSchema, session: idSchema.optional(), workspace: workspaceSchema },
  wards_check: { plan: planSchema, workspace: workspaceSchema },
  blacklight: { path: z.array(z.string()).min(1).max(MAX_PATHS), workspace: workspaceSchema },
};

/** Annotations: only `ghost_run` is not read-only, and it is not destructive. */
export const ANNOTATIONS = {
  ghost_run: { readOnlyHint: false, destructiveHint: false },
  ghost_diff: { readOnlyHint: true },
  ghost_trace: { readOnlyHint: true },
  wards_check: { readOnlyHint: true },
  blacklight: { readOnlyHint: true },
};

/** The exact tool set, in registration order. */
export const TOOL_NAMES = /** @type {const} */ (['ghost_run', 'ghost_diff', 'ghost_trace', 'wards_check', 'blacklight']);

/**
 * Validate raw tool arguments against the shape of `name`.
 * @param {typeof TOOL_NAMES[number]} name
 * @param {unknown} args
 * @returns {{ ok: true, data: any } | { ok: false, field: string, message: string }}
 */
export function parseInput(name, args) {
  const parsed = z.object(INPUT_SHAPES[name]).safeParse(args ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  const field = issue && issue.path.length > 0 ? issue.path.map(String).join('.') : '(input)';
  return { ok: false, field, message: issue ? issue.message : 'invalid input' };
}
