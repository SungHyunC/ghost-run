import { compareCodePoints } from '@ghost-run/core';
import type { Entry, VirtualPath } from '../../state.js';
import { isParsed, parseArgs, type Handler } from './types.js';
import { join, resolveArg } from './util.js';

function sizeOf(entry: Entry): number {
  return entry.kind === 'file' ? entry.bytes.byteLength : 0;
}

export const ls: Handler = (args, io, env) => {
  const parsed = parseArgs('ls', args, ['-a', '-l']);
  if (!isParsed(parsed)) return Promise.resolve(parsed);
  const all = parsed.flags.has('-a');
  const long = parsed.flags.has('-l');
  const operands = parsed.operands.length === 0 ? [''] : parsed.operands;
  const explicit = parsed.operands.length > 0;
  const headers = operands.length > 1;

  const line = (name: string, entry: Entry): string =>
    long ? `${entry.kind === 'dir' ? 'd' : '-'} ${sizeOf(entry)} ${name}\n` : `${name}\n`;

  let code = 0;
  let printed = false;
  for (const arg of operands) {
    let path: VirtualPath;
    if (explicit) {
      const r = resolveArg(arg, env);
      if (!r.ok) {
        io.err(`ls: ${arg}: ${r.message}\n`);
        code = 1;
        continue;
      }
      path = r.path;
    } else {
      path = env.cwd;
    }
    const entry = env.fs.get(path);
    if (entry === undefined) {
      io.err(`ls: cannot access '${arg}': No such file or directory\n`);
      code = 1;
      continue;
    }
    if (entry.kind === 'file') {
      io.out(line(arg, entry));
      printed = true;
      continue;
    }
    if (headers) {
      io.out(`${printed ? '\n' : ''}${arg}:\n`);
    }
    printed = true;
    const names = env.fs.list(path).filter((n) => all || !n.startsWith('.'));
    if (all) names.push('.', '..');
    names.sort(compareCodePoints);
    for (const name of names) {
      const child = name === '.' || name === '..' ? ({ kind: 'dir' } as Entry) : env.fs.get(join(path, name));
      if (child !== undefined) io.out(line(name, child));
    }
  }
  return Promise.resolve(code);
};
