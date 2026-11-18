import { isParsed, parseArgs, type Handler } from './types.js';
import { parentProblem, resolveArg } from './util.js';

export const mkdir: Handler = (args, io, env) => {
  const parsed = parseArgs('mkdir', args, ['-p']);
  if (!isParsed(parsed)) return Promise.resolve(parsed);
  if (parsed.operands.length === 0) {
    io.err('mkdir: missing operand\n');
    return Promise.resolve(1);
  }
  const parents = parsed.flags.has('-p');
  let code = 0;
  for (const arg of parsed.operands) {
    const r = resolveArg(arg, env);
    if (!r.ok) {
      io.err(`mkdir: ${arg}: ${r.message}\n`);
      code = 1;
      continue;
    }
    const existing = env.fs.get(r.path);
    if (existing !== undefined) {
      if (parents && existing.kind === 'dir') continue;
      io.err(`mkdir: cannot create directory '${arg}': File exists\n`);
      code = 1;
      continue;
    }
    if (!parents) {
      const problem = parentProblem(r.path, env);
      if (problem !== undefined) {
        io.err(`mkdir: cannot create directory '${arg}': ${problem}\n`);
        code = 1;
        continue;
      }
      env.fs.putDir(r.path);
      continue;
    }
    // -p: create every missing ancestor; a file in the way is an error.
    const segments = r.path.split('/');
    let current = '';
    let blocked = false;
    for (const segment of segments) {
      current = current === '' ? segment : `${current}/${segment}`;
      const here = env.fs.get(current);
      if (here === undefined) env.fs.putDir(current);
      else if (here.kind !== 'dir') {
        io.err(`mkdir: cannot create directory '${arg}': Not a directory\n`);
        code = 1;
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
  }
  return Promise.resolve(code);
};
