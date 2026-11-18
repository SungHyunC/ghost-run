/**
 * Host side of the SQLite row-count step. Counting itself runs in the box through
 * `ghost-count` (an in-box `sqlite3 -readonly` on a duplicate of each file), so the host
 * needs no SQLite library and a hostile database is never parsed on the host.
 *
 * Wire format of `ghost-count` (stdout, one JSON object):
 *   { "<absolute in-box path>": { "<table>": <row count> } | "unreadable", ... }
 * Keys are the in-box paths that were passed as arguments.
 */

/** Per-table row counts of one SQLite file, or "unreadable" when it could not be counted. */
export type SqliteCounts = Readonly<Record<string, number>> | 'unreadable';

/** Counts keyed by Copy-relative path ('/' separators). Matches `RepoState.sqlite`. */
export type SqliteState = Readonly<Record<string, SqliteCounts>>;

/** Where the Copy is mounted inside the box. */
export const BOX_WORKDIR = '/work';
/** Name of the in-box counting script. */
export const GHOST_COUNT = 'ghost-count';

/**
 * Builds the argv for `docker exec <container> ...`: the script name, `--`, then one
 * absolute in-box path per file. Each path is a single argv element (no shell).
 * Returns `undefined` when there is nothing to count.
 */
export function buildCountInvocation(relPaths: readonly string[]): string[] | undefined {
  if (relPaths.length === 0) return undefined;
  const unique = [...new Set(relPaths)].sort();
  return [GHOST_COUNT, '--', ...unique.map((p) => `${BOX_WORKDIR}/${p}`)];
}

function isCounts(v: unknown): v is Record<string, number> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  return Object.values(v).every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0);
}

/**
 * Parses the `ghost-count` output for the requested Copy-relative paths. Never throws.
 * A non-zero exit code, unparseable output, a missing key, or a malformed value maps
 * that path (or every path, for a failed run) to "unreadable".
 */
export function parseCountOutput(
  stdout: string,
  exitCode: number,
  relPaths: readonly string[],
): SqliteState {
  const entries = (value: (p: string) => SqliteCounts): Array<[string, SqliteCounts]> =>
    relPaths.map((p) => [p, value(p)]);
  const allUnreadable = (): SqliteState => Object.fromEntries(entries(() => 'unreadable'));

  if (exitCode !== 0) return allUnreadable();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return allUnreadable();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return allUnreadable();
  const obj = parsed as Record<string, unknown>;

  return Object.fromEntries(
    entries((p) => {
      const key = `${BOX_WORKDIR}/${p}`;
      if (!Object.hasOwn(obj, key)) return 'unreadable';
      const v = obj[key];
      if (v === 'unreadable') return 'unreadable';
      if (!isCounts(v)) return 'unreadable';
      return Object.fromEntries(Object.entries(v));
    }),
  );
}

/**
 * Computes the next `sqlite` state: records for files that no longer exist are dropped,
 * records for unchanged files are inherited, and freshly counted files replace the old record.
 * `existing` is the set of Copy-relative paths present after the step.
 */
export function nextSqliteState(
  previous: SqliteState,
  counted: SqliteState,
  existing: ReadonlySet<string>,
): SqliteState {
  const out: Array<[string, SqliteCounts]> = [];
  for (const [p, c] of Object.entries(previous)) {
    if (existing.has(p) && !Object.hasOwn(counted, p)) out.push([p, c]);
  }
  for (const [p, c] of Object.entries(counted)) {
    if (existing.has(p)) out.push([p, c]);
  }
  return Object.fromEntries(out.sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
}
