import { isParsed, parseArgs, type Handler } from './types.js';
import { parentProblem, resolveArg } from './util.js';

export const touch: Handler = (args, io, env) => {
  const parsed = parseArgs('touch', args, []);
  if (!isParsed(parsed)) return Promise.resolve(parsed);
  if (parsed.operands.length === 0) {
    io.err('touch: missing file operand\n');
    return Promise.resolve(1);
  }
  let code = 0;
  for (const arg of parsed.operands) {
    const r = resolveArg(arg, env);
    if (!r.ok) {
      io.err(`touch: ${arg}: ${r.message}\n`);
      code = 1;
      continue;
    }
    if (env.fs.get(r.path) !== undefined) continue;
    const problem = parentProblem(r.path, env);
    if (problem !== undefined) {
      io.err(`touch: cannot touch '${arg}': ${problem}\n`);
      code = 1;
      continue;
    }
    env.fs.putFile(r.path, new Uint8Array(0));
  }
  return Promise.resolve(code);
};
