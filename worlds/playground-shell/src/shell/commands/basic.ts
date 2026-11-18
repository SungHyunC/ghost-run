// pwd, echo, true, false.

import { UNSUPPORTED, type Handler } from './types.js';

export const pwd: Handler = (args, io, env) => {
  if (args.length > 0) return Promise.resolve(UNSUPPORTED('pwd: arguments'));
  io.out(`/${env.cwd}\n`);
  return Promise.resolve(0);
};

/** Words that real shells treat as echo options; only -n is supported. */
function isEchoOption(word: string): boolean {
  if (word.length < 2 || !word.startsWith('-')) return false;
  for (const ch of word.slice(1)) if (ch !== 'n' && ch !== 'e' && ch !== 'E') return false;
  return true;
}

export const echo: Handler = (args, io) => {
  let newline = true;
  let i = 0;
  while (i < args.length && isEchoOption(args[i] as string)) {
    if (args[i] !== '-n') return Promise.resolve(UNSUPPORTED(`echo: option ${args[i] as string}`));
    newline = false;
    i++;
  }
  io.out(args.slice(i).join(' ') + (newline ? '\n' : ''));
  return Promise.resolve(0);
};

export const trueCmd: Handler = (args) =>
  Promise.resolve(args.length > 0 ? UNSUPPORTED('true: arguments') : 0);

export const falseCmd: Handler = (args) =>
  Promise.resolve(args.length > 0 ? UNSUPPORTED('false: arguments') : 1);
