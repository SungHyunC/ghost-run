// `pnpm power:link` (design D6 fallback): writes the git-ignored `mcp.local.json` into the power folder.
// It is a copy of `mcp.json` whose `args` hold the absolute path of `server/ghost-run-mcp.mjs`.
// It writes no other file and no secret. The output holds a local absolute path and must never be committed.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MCP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_POWER_DIR = resolve(MCP_DIR, '..', 'power');
export const LOCAL_FILE_NAME = 'mcp.local.json';
const SERVER_RELATIVE = join('server', 'ghost-run-mcp.mjs');

/**
 * @param {string} [powerDir] power folder (default: integrations/power); tests pass a temp copy
 * @returns {Promise<string>} the absolute path of the written file
 */
export async function linkPower(powerDir = DEFAULT_POWER_DIR) {
  const dir = resolve(powerDir);
  const config = JSON.parse(await readFile(join(dir, 'mcp.json'), 'utf8'));
  const server = config?.mcpServers?.['ghost-run'];
  if (server === undefined || typeof server !== 'object') {
    throw new Error('mcp.json has no mcpServers.ghost-run entry');
  }
  server.args = [join(dir, SERVER_RELATIVE)];
  const target = join(dir, LOCAL_FILE_NAME);
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return target;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = await linkPower();
  process.stdout.write(`wrote ${target}\nCopy it into the installed power as mcp.json. Do not commit it.\n`);
}
