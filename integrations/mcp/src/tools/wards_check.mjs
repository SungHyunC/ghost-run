// wards_check: a static check of a plan against the Wards_File. No container, no execution, no verdict.
import { formatConfigError } from '@ghost-run/wards-config';
import { loadWardsFile } from '@ghost-run/wards-config/node';
import { analyze } from '@ghost-run/ghost-runner';
import { buildGrammar, buildSecretMatcher, classifySafe, resolveWardsFile } from '@ghost-run/kiro-hook';
import { defineTool, cutCommand } from '../tool-kit.mjs';
import { errorResult, makeResult } from '../result.mjs';

export const MAX_VALIDATION_STRINGS = 50;
export const STATIC_NOTICE =
  'This is a static check, not a rehearsal: no container was started and no command was executed. It is advisory and returns no verdict.';

const DESCRIPTION =
  'Static, advisory check of a plan: validates the wards file, lists ward ids and kinds, tells which commands are on the safe list, and reports static findings (paths and hosts outside the workspace). Not a rehearsal, starts no container, returns no verdict. A clean result does not make a command safe.';

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server @param {import('../tool-kit.mjs').ToolContext} ctx */
export function register(server, ctx) {
  defineTool(server, ctx, 'wards_check', DESCRIPTION, async (/** @type {{ plan: { command: string, cwd?: string }[] }} */ args) => {
    const load = ctx.deps['loadWardsFile'] ?? loadWardsFile;
    const file = resolveWardsFile(ctx.root, ctx.env);
    /** @type {any} */
    let result;
    try {
      result = await load(file);
    } catch {
      return errorResult('wards file could not be loaded', { validation: ['wards file could not be loaded'], rehearsed: false });
    }
    if (!result || result.ok !== true || !result.wardSet) {
      const list = result && Array.isArray(result.errors) ? result.errors : [];
      const strings = list.slice(0, MAX_VALIDATION_STRINGS).map((/** @type {any} */ e) => formatConfigError(e));
      const validation = strings.length > 0 ? strings : ['wards file is not valid'];
      return errorResult(`wards file is not valid\n${validation.join('\n')}`, { validation, rehearsed: false });
    }
    const wardSet = result.wardSet;
    const { grammar } = buildGrammar(result.safeCommands);
    const matcher = buildSecretMatcher(wardSet);
    const wards = wardSet.wards.map((/** @type {any} */ w) => ({ id: w.id, kind: w.kind }));
    const actions = args.plan.map((/** @type {{ command: string }} */ a, /** @type {number} */ index) => ({
      index,
      command: cutCommand(a.command),
      safe: classifySafe(a.command, grammar, matcher).safe,
      findings: analyze({ command: a.command }).map((e) => ({ kind: e.kind, destination: e.destination })),
    }));
    const structured = {
      check: 'static',
      rehearsed: false,
      notice: STATIC_NOTICE,
      validation: [],
      wards,
      actions,
    };
    const lines = [
      STATIC_NOTICE,
      `wards: ${wards.map((/** @type {{ id: string, kind: string }} */ w) => `${w.id} (${w.kind})`).join(', ') || 'none'}`,
      ...actions.map((a) => `#${a.index} safe=${a.safe} findings=${a.findings.length}: ${a.command}`),
    ];
    return makeResult(structured, { text: lines.join('\n') });
  });
}
