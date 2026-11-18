// Shell tokenizer: one pass over code points. Never throws, never executes anything.
// States: unquoted, single-quoted, double-quoted. Constructs the playground does not
// implement become `bad` tokens with a fixed short reason; the parser turns them into
// an Unsupported_Command.

export type Token =
  | { readonly kind: 'word'; readonly text: string; readonly quoted: boolean; readonly glob: boolean }
  | { readonly kind: 'op'; readonly op: ';' | '&&' | '>' | '>>' }
  | { readonly kind: 'bad'; readonly reason: string };

export const REASON = {
  pipe: 'pipe',
  orList: 'or list',
  background: 'background job',
  inputRedirect: 'input redirection',
  hereDoc: 'here document',
  subshell: 'subshell',
  braceGroup: 'brace group',
  variable: 'variable expansion',
  substitution: 'command substitution',
  comment: 'comment',
  fdRedirect: 'fd redirection',
  newline: 'newline',
  trailingBackslash: 'trailing backslash',
  unterminatedQuote: 'unterminated quote',
  nul: 'nul character',
} as const;

const DIGITS_ONLY = /^[0-9]+$/;

export function tokenize(line: string): Token[] {
  const cps = Array.from(line);
  const tokens: Token[] = [];

  let inWord = false;
  let cur = '';
  let quoted = false;
  let glob = false;

  const bad = (reason: string): void => {
    tokens.push({ kind: 'bad', reason });
  };
  const flush = (): void => {
    if (inWord) tokens.push({ kind: 'word', text: cur, quoted, glob });
    inWord = false;
    cur = '';
    quoted = false;
    glob = false;
  };
  const add = (ch: string, isQuoted: boolean): void => {
    inWord = true;
    cur += ch;
    if (isQuoted) quoted = true;
  };

  let i = 0;
  while (i < cps.length) {
    const ch = cps[i] as string;
    const next = cps[i + 1];

    if (ch === '\u0000') {
      bad(REASON.nul);
      i++;
      continue;
    }
    if (ch === '\n') {
      flush();
      bad(REASON.newline);
      i++;
      continue;
    }

    if (ch === "'") {
      let j = i + 1;
      let body = '';
      let closed = false;
      while (j < cps.length) {
        const c = cps[j] as string;
        if (c === "'") {
          closed = true;
          break;
        }
        if (c === '\u0000') bad(REASON.nul);
        else if (c === '\n') bad(REASON.newline);
        else body += c;
        j++;
      }
      if (!closed) {
        inWord = false;
        cur = '';
        quoted = false;
        glob = false;
        bad(REASON.unterminatedQuote);
        return tokens;
      }
      inWord = true;
      quoted = true;
      cur += body;
      i = j + 1;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let body = '';
      let closed = false;
      while (j < cps.length) {
        const c = cps[j] as string;
        if (c === '"') {
          closed = true;
          break;
        }
        if (c === '\\') {
          const n = cps[j + 1];
          if (n === '"' || n === '\\') {
            body += n;
            j += 2;
            continue;
          }
          if (n === undefined) {
            j++;
            continue;
          }
          body += c;
          j++;
          continue;
        }
        if (c === '$') {
          bad(cps[j + 1] === '(' ? REASON.substitution : REASON.variable);
        } else if (c === '`') {
          bad(REASON.substitution);
        } else if (c === '\u0000') {
          bad(REASON.nul);
        } else if (c === '\n') {
          bad(REASON.newline);
        } else {
          body += c;
        }
        j++;
      }
      if (!closed) {
        inWord = false;
        cur = '';
        quoted = false;
        glob = false;
        bad(REASON.unterminatedQuote);
        return tokens;
      }
      inWord = true;
      quoted = true;
      cur += body;
      i = j + 1;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      flush();
      i++;
      continue;
    }

    if (ch === '\\') {
      if (next === undefined) {
        flush();
        bad(REASON.trailingBackslash);
        i++;
        continue;
      }
      if (next === '\n') {
        flush();
        bad(REASON.newline);
        i += 2;
        continue;
      }
      if (next === '\u0000') {
        bad(REASON.nul);
        i += 2;
        continue;
      }
      add(next, true);
      i += 2;
      continue;
    }

    switch (ch) {
      case ';':
        flush();
        tokens.push({ kind: 'op', op: ';' });
        i++;
        continue;
      case '&':
        flush();
        if (next === '&') {
          tokens.push({ kind: 'op', op: '&&' });
          i += 2;
        } else if (next === '>') {
          bad(REASON.fdRedirect);
          i += cps[i + 2] === '>' ? 3 : 2;
        } else {
          bad(REASON.background);
          i++;
        }
        continue;
      case '>': {
        if (inWord && !quoted && DIGITS_ONLY.test(cur)) {
          inWord = false;
          cur = '';
          glob = false;
          bad(REASON.fdRedirect);
        } else {
          flush();
        }
        if (next === '>') {
          tokens.push({ kind: 'op', op: '>>' });
          i += 2;
        } else {
          tokens.push({ kind: 'op', op: '>' });
          i++;
        }
        continue;
      }
      case '|':
        flush();
        if (next === '|') {
          bad(REASON.orList);
          i += 2;
        } else {
          bad(REASON.pipe);
          i += next === '&' ? 2 : 1;
        }
        continue;
      case '<':
        flush();
        if (next === '<') {
          bad(REASON.hereDoc);
          i += 2;
        } else {
          bad(REASON.inputRedirect);
          i++;
        }
        continue;
      case '(':
      case ')':
        flush();
        bad(REASON.subshell);
        i++;
        continue;
      case '{':
      case '}':
        flush();
        bad(REASON.braceGroup);
        i++;
        continue;
      case '`':
        flush();
        bad(REASON.substitution);
        i++;
        continue;
      case '$':
        bad(next === '(' ? REASON.substitution : REASON.variable);
        i++;
        continue;
      case '#':
        if (!inWord) {
          bad(REASON.comment);
          i++;
          continue;
        }
        add(ch, false);
        i++;
        continue;
      case '*':
      case '?':
      case '[':
        glob = true;
        add(ch, false);
        i++;
        continue;
      default:
        add(ch, false);
        i++;
    }
  }
  flush();
  return tokens;
}
