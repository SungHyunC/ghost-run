import { UNSUPPORTED, isParsed, parseArgs, type Handler } from './types.js';
import { decodeUtf8, resolveArg } from './util.js';

export const cat: Handler = (args, io, env) => {
  const parsed = parseArgs('cat', args, []);
  if (!isParsed(parsed)) return Promise.resolve(parsed);
  if (parsed.operands.length === 0) return Promise.resolve(UNSUPPORTED('cat: reads standard input'));
  let code = 0;
  for (const arg of parsed.operands) {
    const r = resolveArg(arg, env);
    if (!r.ok) {
      io.err(`cat: ${arg}: ${r.message}\n`);
      code = 1;
      continue;
    }
    const entry = env.fs.get(r.path);
    if (entry === undefined) {
      io.err(`cat: ${arg}: No such file or directory\n`);
      code = 1;
    } else if (entry.kind === 'dir') {
      io.err(`cat: ${arg}: Is a directory\n`);
      code = 1;
    } else {
      env.trace.recordRead(r.path);
      io.out(decodeUtf8(entry.bytes));
    }
  }
  return Promise.resolve(code);
};
