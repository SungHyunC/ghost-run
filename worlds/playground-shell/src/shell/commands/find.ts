import { fnmatch } from '../fnmatch.js';
import type { VirtualPath } from '../../state.js';
import { UNSUPPORTED, type Handler } from './types.js';
import { baseOf, join, resolveArg } from './util.js';

interface Spec {
  readonly pattern: string | undefined;
  readonly action: 'print' | 'delete';
}

function parseSpec(rest: readonly string[]): Spec | string {
  let i = 0;
  let pattern: string | undefined;
  if (rest[i] === '-name') {
    const p = rest[i + 1];
    if (p === undefined) return 'find: -name without a pattern';
    pattern = p;
    i += 2;
  }
  let action: 'print' | 'delete' = 'print';
  if (rest[i] === '-print' || rest[i] === '-delete') {
    action = rest[i] === '-delete' ? 'delete' : 'print';
    i++;
  }
  if (i < rest.length) {
    const extra = rest[i] as string;
    if (action === 'delete' && i > 0) return `find: expression after -delete: ${extra}`;
    return `find: unsupported expression ${extra}`;
  }
  return { pattern, action };
}

export const find: Handler = (args, io, env) => {
  const first = args[0];
  if (first === undefined || first.startsWith('-')) return Promise.resolve(UNSUPPORTED('find: no path'));
  const spec = parseSpec(args.slice(1));
  if (typeof spec === 'string') return Promise.resolve(UNSUPPORTED(spec));

  const r = resolveArg(first, env);
  if (!r.ok) {
    io.err(`find: ${first}: ${r.message}\n`);
    return Promise.resolve(1);
  }
  if (env.fs.get(r.path) === undefined) {
    io.err(`find: '${first}': No such file or directory\n`);
    return Promise.resolve(1);
  }

  const rootName = baseOf(first.split('/').filter((p) => p !== '').join('/')) || first;
  const display = (path: VirtualPath): string => {
    if (path === r.path) return first;
    const rel = r.path === '' ? path : path.slice(r.path.length + 1);
    return first.endsWith('/') ? first + rel : `${first}/${rel}`;
  };
  const matches = (path: VirtualPath): boolean =>
    spec.pattern === undefined || fnmatch(spec.pattern, path === r.path ? rootName : baseOf(path));

  let code = 0;
  const visit = (path: VirtualPath): void => {
    const entry = env.fs.get(path);
    if (entry === undefined) return;
    if (spec.action === 'print') {
      if (matches(path)) io.out(`${display(path)}\n`);
      if (entry.kind === 'dir') for (const name of env.fs.list(path)) visit(join(path, name));
      return;
    }
    if (entry.kind === 'dir') for (const name of env.fs.list(path)) visit(join(path, name));
    if (!matches(path) || path === '') return;
    if (entry.kind === 'dir' && env.fs.list(path).length > 0) {
      io.err(`find: cannot delete '${display(path)}': Directory not empty\n`);
      code = 1;
      return;
    }
    env.fs.remove(path);
  };
  visit(r.path);
  return Promise.resolve(code);
};
