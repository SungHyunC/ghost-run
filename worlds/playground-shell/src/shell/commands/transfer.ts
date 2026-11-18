// mv and cp share the destination rule and most checks.

import type { Entry, VirtualPath } from '../../state.js';
import { UNSUPPORTED, isParsed, parseArgs, type Handler, type Io } from './types.js';
import type { RunEnv } from '../interpret.js';
import { baseOf, isWithin, join, parentProblem, resolveArg } from './util.js';

interface Plan {
  readonly source: VirtualPath;
  readonly target: VirtualPath;
  readonly sourceEntry: Entry;
}

/** Validates source and destination; returns a plan or an exit code (message already written). */
function plan(name: string, srcArg: string, dstArg: string, io: Io, env: RunEnv): Plan | 1 {
  const s = resolveArg(srcArg, env);
  const d = resolveArg(dstArg, env);
  if (!s.ok || !d.ok) {
    const message = !s.ok ? s.message : (d as { message: string }).message;
    io.err(`${name}: ${message}\n`);
    return 1;
  }
  const sourceEntry = env.fs.get(s.path);
  if (sourceEntry === undefined) {
    io.err(`${name}: cannot stat '${srcArg}': No such file or directory\n`);
    return 1;
  }
  if (s.path === '') {
    io.err(`${name}: cannot ${name === 'mv' ? 'move' : 'copy'} the project root\n`);
    return 1;
  }
  const destEntry = env.fs.get(d.path);
  const target = destEntry !== undefined && destEntry.kind === 'dir' ? join(d.path, baseOf(s.path)) : d.path;
  if (target === s.path) {
    io.err(`${name}: '${srcArg}' and '${dstArg}' are the same file\n`);
    return 1;
  }
  if (sourceEntry.kind === 'dir' && isWithin(target, s.path)) {
    io.err(`${name}: cannot ${name === 'mv' ? 'move' : 'copy'} '${srcArg}' into itself\n`);
    return 1;
  }
  const problem = parentProblem(target, env);
  if (problem !== undefined) {
    io.err(`${name}: cannot ${name === 'mv' ? 'move' : 'copy'} to '${dstArg}': ${problem}\n`);
    return 1;
  }
  const existing = env.fs.get(target);
  if (existing !== undefined) {
    if (sourceEntry.kind === 'dir' && existing.kind === 'file') {
      io.err(`${name}: cannot overwrite non-directory '${dstArg}' with directory '${srcArg}'\n`);
      return 1;
    }
    if (sourceEntry.kind === 'file' && existing.kind === 'dir') {
      io.err(`${name}: cannot overwrite directory '${dstArg}' with non-directory\n`);
      return 1;
    }
    if (name === 'mv' && existing.kind === 'dir' && env.fs.list(target).length > 0) {
      io.err(`mv: cannot move '${srcArg}' to '${dstArg}': Directory not empty\n`);
      return 1;
    }
  }
  return { source: s.path, target, sourceEntry };
}

function operands(name: string, flagList: string[], args: string[], io: Io) {
  const parsed = parseArgs(name, args, flagList);
  if (!isParsed(parsed)) return parsed;
  if (parsed.operands.length > 2) return UNSUPPORTED(`${name}: more than two operands`);
  if (parsed.operands.length < 2) {
    io.err(`${name}: missing file operand\n`);
    return 1 as const;
  }
  return parsed;
}

function rewrite(path: VirtualPath, from: VirtualPath, to: VirtualPath): VirtualPath {
  return path === from ? to : join(to, path.slice(from.length + 1));
}

export const mv: Handler = (args, io, env) => {
  const p = operands('mv', [], args, io);
  if (typeof p === 'number') return Promise.resolve(p);
  if (!isParsed(p)) return Promise.resolve(p);
  const result = plan('mv', p.operands[0] as string, p.operands[1] as string, io, env);
  if (result === 1) return Promise.resolve(1);
  const moved = env.fs.walk(result.source).map((path) => ({ path, entry: env.fs.get(path) as Entry }));
  if (env.fs.get(result.target) !== undefined) env.fs.remove(result.target);
  env.fs.remove(result.source);
  for (const { path, entry } of moved) put(env, rewrite(path, result.source, result.target), entry);
  return Promise.resolve(0);
};

export const cp: Handler = (args, io, env) => {
  const p = operands('cp', ['-r'], args, io);
  if (typeof p === 'number') return Promise.resolve(p);
  if (!isParsed(p)) return Promise.resolve(p);
  const recursive = p.flags.has('-r');
  const srcArg = p.operands[0] as string;
  const result = plan('cp', srcArg, p.operands[1] as string, io, env);
  if (result === 1) return Promise.resolve(1);
  if (result.sourceEntry.kind === 'dir' && !recursive) {
    io.err(`cp: -r not specified; omitting directory '${srcArg}'\n`);
    return Promise.resolve(1);
  }
  const copied = env.fs.walk(result.source).map((path) => ({ path, entry: env.fs.get(path) as Entry }));
  for (const { path, entry } of copied) {
    if (entry.kind === 'file') env.trace.recordRead(path);
  }
  for (const { path, entry } of copied) {
    const to = rewrite(path, result.source, result.target);
    const here = env.fs.get(to);
    if (entry.kind === 'dir' && here !== undefined && here.kind === 'dir') continue; // merge
    put(env, to, entry);
  }
  return Promise.resolve(0);
};

function put(env: RunEnv, path: VirtualPath, entry: Entry): void {
  if (entry.kind === 'dir') env.fs.putDir(path);
  else env.fs.putFile(path, entry.bytes, entry.tables);
}
