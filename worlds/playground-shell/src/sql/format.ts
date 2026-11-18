// sqlite3-shell-like output formatting.

export type SqlCell = unknown;

function formatCell(value: SqlCell): string {
  if (value === null || value === undefined) return '';
  if (ArrayBuffer.isView(value)) return `[blob ${value.byteLength} bytes]`;
  return String(value);
}

export function formatRow(row: readonly SqlCell[]): string {
  return row.map(formatCell).join('|');
}

/** Formats result sets as `a|b` lines and cuts the text at `limit` characters. */
export function formatResults(results: readonly { values: readonly (readonly SqlCell[])[] }[], limit: number): string {
  let out = '';
  for (const result of results) {
    for (const row of result.values) {
      out += `${formatRow(row)}\n`;
      if (out.length >= limit) return out.slice(0, Math.max(0, limit));
    }
  }
  return out;
}
