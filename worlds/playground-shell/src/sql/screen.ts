// Lexical screening of SQL text (design D7). Returns the first reason the text
// cannot run deterministically, or null when it is allowed.

const CLOCK_RANDOM = new Set([
  'random',
  'randomblob',
  'current_time',
  'current_date',
  'current_timestamp',
  'date',
  'time',
  'datetime',
  'julianday',
  'unixepoch',
  'strftime',
]);

function isWordChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code === 36 ||
    code > 127
  );
}

/** Reads a quoted run starting at `start` (the quote char) and returns [content, indexAfter]. */
function readQuoted(sql: string, start: number, close: string): [string, number] {
  let i = start + 1;
  let out = '';
  while (i < sql.length) {
    const ch = sql[i] as string;
    if (ch === close) {
      if (close !== ']' && sql[i + 1] === close) {
        out += close;
        i += 2;
        continue;
      }
      return [out, i + 1];
    }
    out += ch;
    i += 1;
  }
  return [out, i];
}

export function screenSql(sql: string): string | null {
  let i = 0;
  let firstSignificant = true;
  let sawVacuum = false;
  while (i < sql.length) {
    const ch = sql[i] as string;
    const code = sql.charCodeAt(i);
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v') {
      i += 1;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (firstSignificant) {
      firstSignificant = false;
      if (ch === '.') return 'dot-command';
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const [content, next] = readQuoted(sql, i, ch);
      if (ch !== '`' && content.toLowerCase() === 'now') return "'now'";
      i = next;
      continue;
    }
    if (ch === '[') {
      i = readQuoted(sql, i, ']')[1];
      continue;
    }
    if (ch === ';') {
      sawVacuum = false;
      i += 1;
      continue;
    }
    if (isWordChar(code)) {
      let j = i + 1;
      while (j < sql.length && isWordChar(sql.charCodeAt(j))) j += 1;
      const word = sql.slice(i, j).toLowerCase();
      i = j;
      if (word === 'attach') return 'ATTACH';
      if (word === 'detach') return 'DETACH';
      if (word === 'load_extension') return 'load_extension';
      if (word === 'max_page_count') return 'max_page_count';
      if (word === 'vacuum') sawVacuum = true;
      else if (word === 'into' && sawVacuum) return 'VACUUM INTO';
      if (CLOCK_RANDOM.has(word)) return word;
      continue;
    }
    i += 1;
  }
  return null;
}
