// Parser: tokens -> SimpleCommand[]. Splits at `;` and `&&`. A segment that the
// interpreter cannot run carries `unsupportedReason`; the parser never throws.

import { COMMAND_MAX, LINE_COMMANDS_MAX } from './limits.js';
import { tokenize, type Token } from './tokenize.js';

export interface SimpleCommand {
  readonly words: string[];
  readonly redirect?: { readonly op: '>' | '>>'; readonly target: string };
  /** The operator that precedes this command; null for the first. */
  readonly connector: ';' | '&&' | null;
  readonly unsupportedReason?: string;
}

export const PARSE_REASON = {
  glob: 'glob',
  multipleRedirects: 'multiple redirections',
  redirectNoTarget: 'redirection without target',
  noCommand: 'no command',
  emptySegment: 'empty command',
  trailingAnd: 'trailing &&',
  tooLong: 'command line too long',
} as const;

interface Draft {
  words: string[];
  redirect?: { op: '>' | '>>'; target: string };
  connector: ';' | '&&' | null;
  reason?: string;
  tokenCount: number;
}

export function parseTokens(tokens: readonly Token[]): SimpleCommand[] {
  const out: SimpleCommand[] = [];
  let draft: Draft = { words: [], connector: null, tokenCount: 0 };

  const finish = (): void => {
    const d = draft;
    let reason = d.reason;
    if (reason === undefined) {
      if (d.tokenCount === 0) reason = PARSE_REASON.emptySegment;
      else if (d.words.length === 0) reason = PARSE_REASON.noCommand;
    }
    const cmd: SimpleCommand = {
      words: d.words,
      connector: d.connector,
      ...(d.redirect !== undefined ? { redirect: d.redirect } : {}),
      ...(reason !== undefined ? { unsupportedReason: reason } : {}),
    };
    out.push(cmd);
  };

  const setReason = (r: string): void => {
    if (draft.reason === undefined) draft.reason = r;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    if (t.kind === 'op' && (t.op === ';' || t.op === '&&')) {
      finish();
      draft = { words: [], connector: t.op, tokenCount: 0 };
      continue;
    }
    draft.tokenCount++;
    if (t.kind === 'bad') {
      setReason(t.reason);
    } else if (t.kind === 'word') {
      if (t.glob) setReason(PARSE_REASON.glob);
      draft.words.push(t.text);
    } else {
      // '>' or '>>'
      if (draft.redirect !== undefined) setReason(PARSE_REASON.multipleRedirects);
      const n = tokens[i + 1];
      if (n !== undefined && n.kind === 'word') {
        if (n.glob) setReason(PARSE_REASON.glob);
        draft.redirect ??= { op: t.op as '>' | '>>', target: n.text };
        draft.tokenCount++;
        i++;
      } else if (n === undefined || n.kind === 'op') {
        setReason(PARSE_REASON.redirectNoTarget);
      }
    }
  }

  // Segment after the last operator.
  const last = tokens[tokens.length - 1];
  if (tokens.length === 0) {
    finish();
  } else if (draft.tokenCount > 0) {
    finish();
  } else if (last !== undefined && last.kind === 'op' && last.op === '&&') {
    draft.reason = PARSE_REASON.trailingAnd;
    finish();
  }
  // A trailing `;` leaves an empty draft that is dropped.

  return out;
}

/** Tokenizes and parses one command line, enforcing the line limits. */
export function parseLine(line: string): SimpleCommand[] {
  const commands = parseTokens(tokenize(line));
  const tooLong = Array.from(line).length > COMMAND_MAX || commands.length > LINE_COMMANDS_MAX;
  if (tooLong && commands.length > 0) {
    const first = commands[0] as SimpleCommand;
    commands[0] = { ...first, unsupportedReason: PARSE_REASON.tooLong };
  }
  return commands;
}
