import { NPM_DEPTH_MAX } from '../limits.js';
import { UNSUPPORTED, type Handler } from './types.js';
import { decodeUtf8 } from './util.js';

const SCRIPT_NAME = /^[A-Za-z0-9:_-]{1,64}$/;
const REGISTRY = 'registry.npmjs.org:443';
const NO_NETWORK = 'network unavailable in the ghost\n';

function readScripts(bytes: Uint8Array | undefined): Record<string, unknown> | null {
  if (bytes === undefined) return null;
  try {
    const value: unknown = JSON.parse(decodeUtf8(bytes));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const scripts = (value as { scripts?: unknown }).scripts;
    if (scripts === undefined) return {};
    if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return null;
    return scripts as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const npm: Handler = async (args, io, env) => {
  const sub = args[0];
  if (sub === 'install' || sub === 'i' || sub === 'ci') {
    if (args.length !== 1) return UNSUPPORTED(`npm: ${sub} with arguments`);
    env.trace.recordNetwork(REGISTRY);
    io.err(NO_NETWORK);
    return 1;
  }
  let script: string;
  if (sub === 'test') {
    if (args.length !== 1) return UNSUPPORTED('npm: test with arguments');
    script = 'test';
  } else if (sub === 'run') {
    if (args.length !== 2) return UNSUPPORTED('npm: run expects one script name');
    script = args[1] as string;
    if (!SCRIPT_NAME.test(script)) return UNSUPPORTED('npm: script name');
  } else {
    return UNSUPPORTED(`npm: ${sub === undefined ? 'no subcommand' : `subcommand ${sub}`}`);
  }
  if (env.depth >= NPM_DEPTH_MAX) return UNSUPPORTED('npm: nesting depth');

  const file = env.fs.get('package.json');
  const scripts = readScripts(file?.kind === 'file' ? file.bytes : undefined);
  if (scripts === null) {
    io.err('package.json unreadable\n');
    return 1;
  }
  const text = Object.hasOwn(scripts, script) ? scripts[script] : undefined;
  if (typeof text !== 'string') {
    io.err(`Missing script: ${script}\n`);
    return 1;
  }
  if (Object.hasOwn(scripts, `pre${script}`) || Object.hasOwn(scripts, `post${script}`)) {
    return UNSUPPORTED('npm: lifecycle scripts');
  }

  const inner = await env.runLine(text, { ...env, depth: env.depth + 1 });
  io.out(inner.stdout);
  if (inner.unsupportedReason !== undefined) {
    const suffix = `unsupported: ${inner.unsupportedReason}`;
    io.err(inner.stderr.endsWith(suffix) ? inner.stderr.slice(0, -suffix.length) : inner.stderr);
    return UNSUPPORTED(inner.unsupportedReason);
  }
  io.err(inner.stderr);
  if (inner.watchdog) io.watchdog = true;
  return inner.exitCode;
};
