// Stats_Event lines and their summary. A line carries a kind token and a UTC
// time to the second. It never carries a command, path, or text.

export const STATS_KINDS = Object.freeze([
  'seen',
  'safe-skip',
  'ghosted',
  'passed',
  'warned',
  'blocked',
  'executed',
  'provenance-skipped',
]);

/** @typedef {'seen'|'safe-skip'|'ghosted'|'passed'|'warned'|'blocked'|'executed'|'provenance-skipped'} StatsKind */
/**
 * @typedef {{
 *   commandsSeen: number, commandsGhosted: number, commandsBlocked: number,
 *   commandsWarned: number, commandsSafeSkipped: number, commandsExecuted: number,
 * }} StatsSummary
 */

const LINE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * UTC time to the second, `YYYY-MM-DDTHH:MM:SSZ`.
 * @param {Date | number | (() => Date | number)} [clock] a Date, epoch ms, or a function returning one
 * @returns {string}
 */
export function utcSecond(clock = () => new Date()) {
  const raw = typeof clock === 'function' ? clock() : clock;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) throw new TypeError('invalid clock value');
  return `${d.toISOString().slice(0, 19)}Z`;
}

/**
 * Build one Stats_Event line (no terminator).
 * @param {StatsKind} kind
 * @param {Date | number | (() => Date | number)} [clock] a Date, epoch ms, or a function returning one
 * @returns {string}
 */
export function statsLine(kind, clock = () => new Date()) {
  if (!STATS_KINDS.includes(kind)) throw new TypeError('unknown stats kind');
  return JSON.stringify({ kind, at: utcSecond(clock) });
}

/**
 * Pure: count events. Corrupt or unknown lines are ignored.
 * @param {readonly string[]} lines
 * @returns {StatsSummary}
 */
export function summarizeStats(lines) {
  const s = {
    commandsSeen: 0,
    commandsGhosted: 0,
    commandsBlocked: 0,
    commandsWarned: 0,
    commandsSafeSkipped: 0,
    commandsExecuted: 0,
  };
  for (const line of lines) {
    /** @type {unknown} */
    let v;
    try {
      v = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof v !== 'object' || v === null || Array.isArray(v)) continue;
    const o = /** @type {Record<string, unknown>} */ (v);
    if (typeof o.at !== 'string' || !LINE_RE.test(o.at)) continue;
    switch (o.kind) {
      case 'seen':
        s.commandsSeen++;
        break;
      case 'ghosted':
        s.commandsGhosted++;
        break;
      case 'blocked':
        s.commandsBlocked++;
        break;
      case 'warned':
        s.commandsWarned++;
        break;
      case 'safe-skip':
        s.commandsSafeSkipped++;
        break;
      case 'executed':
        s.commandsExecuted++;
        break;
      default:
        break;
    }
  }
  return s;
}

/**
 * Plain-text table of a summary.
 * @param {StatsSummary} summary
 * @returns {string}
 */
export function formatStatsTable(summary) {
  const rows = [
    ['Commands seen', summary.commandsSeen],
    ['Commands ghosted', summary.commandsGhosted],
    ['Commands blocked', summary.commandsBlocked],
    ['Commands warned', summary.commandsWarned],
    ['Commands safe-skipped', summary.commandsSafeSkipped],
    ['Commands executed', summary.commandsExecuted],
  ];
  const width = Math.max(...rows.map(([label]) => String(label).length));
  return rows.map(([label, n]) => `${String(label).padEnd(width)}  ${n}`).join('\n');
}
