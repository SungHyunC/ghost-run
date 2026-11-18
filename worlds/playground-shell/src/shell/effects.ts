// effectsOutside: one network effect per URL word of each supported simple command.

import type { Effect } from '@ghost-run/core';
import type { PlaygroundAction } from '../state.js';
import { HANDLERS } from './commands/index.js';
import { parseLine } from './parse.js';

const URL_WORD = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;

export function effectsOutside(action: PlaygroundAction): Effect[] {
  const effects: Effect[] = [];
  for (const cmd of parseLine(action.command)) {
    if (cmd.unsupportedReason !== undefined) continue;
    const name = cmd.words[0];
    if (name === undefined || !HANDLERS.has(name)) continue;
    for (const word of cmd.words.slice(1)) {
      if (URL_WORD.test(word)) effects.push({ kind: 'network', destination: word });
    }
  }
  return effects;
}
