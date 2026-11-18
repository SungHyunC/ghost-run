import { isParsed, parseArgs, type Handler } from './types.js';
import { resolveArg } from './util.js';

/** True when the last segment of the argument is `.` or `..` (or the argument names the root). */
function refusedArg(arg: string): boolean {
  const parts = arg.split('/').filter((p) => p !== '');
  if (parts.length === 0) return true;
  const last = parts[parts.length - 1];
  return last === '.' || last === '..';
}

export const rm: Handler = (args, io, env) => {
  const parsed = parseArgs('rm', args, ['-r', '-f', '-rf', '-fr']);
  if (!isParsed(parsed)) return Promise.resolve(parsed);
  const recursive = ['-r', '-rf', '-fr'].some((f) => parsed.flags.has(f));
  const force = ['-f', '-rf', '-fr'].some((f) => parsed.flags.has(f));
  if (parsed.operands.length === 0) {
    if (force) return Promise.resolve(0);
    io.err('rm: missing operand\n');
    return Promise.resolve(1);
  }
  let code = 0;
  for (const arg of parsed.operands) {
    const r = resolveArg(arg, env);
    if (!r.ok) {
      io.err(`rm: ${arg}: ${r.message}\n`);
      code = 1;
      continue;
    }
    if (r.path === '' || refusedArg(arg)) {
      io.err("rm: refusing to remove '.' or '..'\n");
      code = 1;
      continue;
    }
    const entry = env.fs.get(r.path);
    if (entry === undefined) {
      if (!force) {
        io.err(`rm: cannot remove '${arg}': No such file or directory\n`);
        code = 1;
      }
      continue;
    }
    if (entry.kind === 'dir' && !recursive) {
      io.err(`rm: cannot remove '${arg}': Is a directory\n`);
      code = 1;
      continue;
    }
    env.fs.remove(r.path);
  }
  return Promise.resolve(code);
};
