// Number formats used by the narration and the ward rows.

/** 1206 -> "1,206". */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** 27.53 -> "27.5 N". */
export function formatForce(n: number): string {
  return `${n.toFixed(1)} N`;
}

/** (7, 8) -> "7 of 8 = 88%". */
export function formatRate(ok: number, total: number): string {
  return `${ok} of ${total} = ${Math.round((100 * ok) / total)}%`;
}

/** Nearest multiple of 100, ties upward: 789 -> 800. */
export function roundLines(n: number): number {
  return Math.round(n / 100) * 100;
}
