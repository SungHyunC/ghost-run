// Independent reference for host matching (Property 4). Imports nothing from
// the code under test. Works on undecorated, already-normalized inputs.

export interface OracleEntry {
  readonly wildcard: boolean;
  /** Lower-case host. For a wildcard entry this is the part after `*.`. */
  readonly host: string;
  readonly port?: number;
}

/** Reference answer for a name destination `(host, port)` against one entry. */
export function oracleAllowsName(entry: OracleEntry, host: string, port?: number): boolean {
  if (entry.port !== undefined && entry.port !== port) return false;
  if (!entry.wildcard) return host === entry.host;
  const tail = '.' + entry.host;
  if (!host.endsWith(tail)) return false;
  const prefix = host.slice(0, host.length - tail.length);
  return prefix.length > 0 && prefix.indexOf('.') < 0;
}

/** Reference for a list: any entry allows. */
export function oracleAllowsAny(
  entries: readonly OracleEntry[],
  host: string,
  port?: number,
): boolean {
  return entries.some((e) => oracleAllowsName(e, host, port));
}

/** Entry text for an OracleEntry. */
export function entryText(e: OracleEntry): string {
  return (e.wildcard ? '*.' : '') + e.host + (e.port === undefined ? '' : ':' + String(e.port));
}

/** The eight 16-bit groups of the two reserved IPv6 addresses used in tests. */
export const IPV6_LOOPBACK: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 1];
export const IPV6_MAPPED: readonly number[] = [0, 0, 0, 0, 0, 0xffff, 0xc000, 0x020a];

export function sameGroups(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Render groups in full 8-group form with chosen padding and case. */
export function renderGroups(groups: readonly number[], pad: readonly number[], upper: boolean): string {
  return groups
    .map((g, i) => {
      let s = g.toString(16).padStart(Math.max(1, Math.min(4, pad[i % pad.length] ?? 1)), '0');
      if (upper) s = s.toUpperCase();
      return s;
    })
    .join(':');
}
