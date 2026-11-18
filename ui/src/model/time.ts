const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/** Days since 1970-01-01 of a proleptic Gregorian date (days-from-civil). */
function daysFromCivil(y0: number, m: number, d: number): number {
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Epoch ms of 'YYYY-MM-DDTHH:MM:SS[.fff]Z', or null. Never calls Date. */
export function parseUtcInstant(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = INSTANT.exec(s);
  if (m === null) return null;
  const [y, mo, d, h, mi, se] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i]));
  if (y === undefined || mo === undefined || d === undefined || h === undefined || mi === undefined || se === undefined) {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || se > 59) return null;
  const ms = m[7] === undefined ? 0 : Number(m[7].padEnd(3, '0'));
  return ((daysFromCivil(y, mo, d) * 24 + h) * 60 + mi) * 60000 + se * 1000 + ms;
}
