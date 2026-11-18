// KMP search over UTF-16 code units. Pure, O(n + m) per call.

function foldUnit(unit: number): number {
  // ASCII-only fold: A-Z (0x41..0x5A) -> a-z. Length never changes.
  return unit >= 0x41 && unit <= 0x5a ? unit + 0x20 : unit;
}

/**
 * Yield every start index (ascending, overlapping matches included) at which
 * `needle` occurs in `haystack`, starting the search at index `from`.
 * With `fold` true, only ASCII letters are compared case-insensitively.
 * An empty needle yields nothing.
 */
export function* findAll(
  haystack: string,
  needle: string,
  fold: boolean,
  from = 0,
): Generator<number, void, undefined> {
  const m = needle.length;
  if (m === 0) return;
  const n = haystack.length;
  const start = from < 0 ? 0 : from;
  if (start >= n || n - start < m) return;

  const key: number[] = new Array<number>(m);
  for (let i = 0; i < m; i++) {
    const unit = needle.charCodeAt(i);
    key[i] = fold ? foldUnit(unit) : unit;
  }

  // Failure table: fail[i] = length of the longest proper border of key[0..i].
  const fail: number[] = new Array<number>(m).fill(0);
  for (let i = 1, k = 0; i < m; i++) {
    while (k > 0 && key[i] !== key[k]) k = fail[k - 1] as number;
    if (key[i] === key[k]) k++;
    fail[i] = k;
  }

  let k = 0;
  for (let i = start; i < n; i++) {
    const unit = haystack.charCodeAt(i);
    const h = fold ? foldUnit(unit) : unit;
    while (k > 0 && h !== key[k]) k = fail[k - 1] as number;
    if (h === key[k]) k++;
    if (k === m) {
      yield i - m + 1;
      k = fail[k - 1] as number;
    }
  }
}
