// Iterative basename glob for `find -name`: `*`, `?`, `[abc]`, `[!abc]` (ranges `a-z` too).
// No regular expression. Works on code points. `*` and `?` also match a leading dot.

interface ClassResult {
  readonly matched: boolean;
  readonly next: number;
}

/** Parses the bracket class starting at pat[start] === '['. Returns null when unterminated. */
function matchClass(pat: readonly string[], start: number, ch: string): ClassResult | null {
  let i = start + 1;
  let negate = false;
  if (pat[i] === '!') {
    negate = true;
    i++;
  }
  let matched = false;
  let first = true;
  while (i < pat.length) {
    const c = pat[i] as string;
    if (c === ']' && !first) {
      return { matched: matched !== negate, next: i + 1 };
    }
    first = false;
    if (pat[i + 1] === '-' && i + 2 < pat.length && pat[i + 2] !== ']') {
      const hi = pat[i + 2] as string;
      if (cp(c) <= cp(ch) && cp(ch) <= cp(hi)) matched = true;
      i += 3;
      continue;
    }
    if (c === ch) matched = true;
    i++;
  }
  return null;
}

function cp(s: string): number {
  return s.codePointAt(0) ?? 0;
}

export function fnmatch(pattern: string, name: string): boolean {
  const pat = Array.from(pattern);
  const str = Array.from(name);
  let p = 0;
  let n = 0;
  let starP = -1;
  let starN = 0;

  while (n < str.length) {
    let advanced = false;
    if (p < pat.length) {
      const c = pat[p] as string;
      const ch = str[n] as string;
      if (c === '*') {
        starP = p;
        starN = n;
        p++;
        continue;
      }
      if (c === '?') {
        p++;
        n++;
        continue;
      }
      if (c === '[') {
        const r = matchClass(pat, p, ch);
        if (r === null) {
          if (ch === '[') advanced = true;
          if (advanced) {
            p++;
            n++;
            continue;
          }
        } else if (r.matched) {
          p = r.next;
          n++;
          continue;
        }
      } else if (c === ch) {
        p++;
        n++;
        continue;
      }
    }
    if (starP >= 0) {
      starN++;
      n = starN;
      p = starP + 1;
      continue;
    }
    return false;
  }
  while (p < pat.length && pat[p] === '*') p++;
  return p === pat.length;
}
