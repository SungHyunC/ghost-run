// Reference glob matcher for Property 3 (wards spec). Naive recursion over the
// grammar; it shares no code with core/src/judge/glob.ts and imports nothing.
//
// Semantics: the pattern is anchored at the root and carries an implicit
// trailing `**`, so a path below a named directory matches. Inputs are
// already-normalized: no empty, `.` or `..` segments.

type Unit =
  | { readonly k: 'lit'; readonly c: string }
  | { readonly k: 'any' }
  | { readonly k: 'star' }
  | { readonly k: 'cls'; readonly neg: boolean; readonly set: readonly (string | readonly [string, string])[] };

function parseSegment(seg: string): Unit[] {
  const cs = Array.from(seg);
  const out: Unit[] = [];
  let i = 0;
  while (i < cs.length) {
    const c = cs[i] as string;
    if (c === '*') {
      out.push({ k: 'star' });
      i++;
    } else if (c === '?') {
      out.push({ k: 'any' });
      i++;
    } else if (c === '[') {
      let j = i + 1;
      let neg = false;
      if (cs[j] === '!') {
        neg = true;
        j++;
      }
      const set: (string | readonly [string, string])[] = [];
      while (j < cs.length && cs[j] !== ']') {
        if (cs[j + 1] === '-' && cs[j + 2] !== undefined && cs[j + 2] !== ']') {
          set.push([cs[j] as string, cs[j + 2] as string]);
          j += 3;
        } else {
          set.push(cs[j] as string);
          j++;
        }
      }
      out.push({ k: 'cls', neg, set });
      i = j + 1;
    } else {
      out.push({ k: 'lit', c });
      i++;
    }
  }
  return out;
}

function one(s: string): string | undefined {
  return Array.from(s).length === 1 ? s : undefined;
}

function lc(c: string): string {
  return one(c.toLowerCase()) ?? c;
}

function uc(c: string): string {
  return one(c.toUpperCase()) ?? c;
}

function inSet(set: readonly (string | readonly [string, string])[], c: string): boolean {
  const cp = c.codePointAt(0) as number;
  return set.some((it) =>
    typeof it === 'string'
      ? it === c
      : cp >= (it[0].codePointAt(0) as number) && cp <= (it[1].codePointAt(0) as number),
  );
}

function matchUnits(us: readonly Unit[], ui: number, cs: readonly string[], ci: number, cs0: boolean): boolean {
  if (ui === us.length) return ci === cs.length;
  const u = us[ui] as Unit;
  if (u.k === 'star') {
    for (let n = ci; n <= cs.length; n++) {
      if (matchUnits(us, ui + 1, cs, n, cs0)) return true;
    }
    return false;
  }
  if (ci === cs.length) return false;
  const c = cs[ci] as string;
  let ok: boolean;
  if (u.k === 'any') ok = true;
  else if (u.k === 'lit') ok = cs0 ? u.c === c : lc(u.c) === lc(c);
  else {
    const hit = cs0 ? inSet(u.set, c) : inSet(u.set, c) || inSet(u.set, lc(c)) || inSet(u.set, uc(c));
    ok = u.neg ? !hit : hit;
  }
  return ok && matchUnits(us, ui + 1, cs, ci + 1, cs0);
}

function matchSegs(ps: readonly string[], pi: number, ss: readonly string[], si: number, cs0: boolean): boolean {
  if (pi === ps.length) return true; // implicit trailing `**`: anything below matches
  const p = ps[pi] as string;
  if (p === '**') {
    for (let n = si; n <= ss.length; n++) {
      if (matchSegs(ps, pi + 1, ss, n, cs0)) return true;
    }
    return false;
  }
  if (si === ss.length) return false;
  return (
    matchUnits(parseSegment(p), 0, Array.from(ss[si] as string), 0, cs0) &&
    matchSegs(ps, pi + 1, ss, si + 1, cs0)
  );
}

/** Reference result for a valid pattern and a normalized path (`''` is the root). */
export function oracleGlobMatches(pattern: string, path: string, caseSensitive: boolean): boolean {
  const ps = pattern.split('/');
  const ss = path === '' ? [] : path.split('/');
  return matchSegs(ps, 0, ss, 0, caseSensitive);
}
