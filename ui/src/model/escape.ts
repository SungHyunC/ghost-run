import { COMPACT_MAX, DETAIL_MAX } from './limits';

/** The Hidden_Display_Code_Point ranges (no emoji exception: U+200D is always hidden). */
export function isHiddenDisplay(cp: number): boolean {
  return (
    (cp >= 0xe0000 && cp <= 0xe007f) ||
    (cp >= 0x200b && cp <= 0x200d) ||
    cp === 0x2060 ||
    cp === 0xfeff ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069)
  );
}

/** '<U+XXXX>': uppercase hex, at least four digits. */
export function formatHex(codePoint: number): string {
  return `<U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}>`;
}

function isControl(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
}

function isSurrogate(cp: number): boolean {
  return cp >= 0xd800 && cp <= 0xdfff;
}

/**
 * One display token per code point of the input: the code point itself, or its Hex_Notation.
 * `for...of` yields an unpaired surrogate as a single element in U+D800 to U+DFFF.
 */
function tokenize(s: string, keepNewline: boolean): string[] {
  const out: string[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isHiddenDisplay(cp) || isSurrogate(cp) || (isControl(cp) && !(keepNewline && cp === 0x0a))) {
      out.push(formatHex(cp));
    } else {
      out.push(ch);
    }
  }
  return out;
}

/** Length of a token in output code points (all hex tokens are ASCII). */
function tokenLength(t: string): number {
  return t.length > 1 && t.startsWith('<U+') ? t.length : 1;
}

/**
 * Replace every Hidden_Display_Code_Point, control code point (U+000A kept only on request),
 * and unpaired surrogate by '<U+XXXX>'. Idempotent: the output of a token is plain ASCII.
 */
export function escapeForDisplay(s: string, opts?: { keepNewline?: boolean }): string {
  return tokenize(s, opts?.keepNewline === true).join('');
}

/** Append whole tokens while the running length stays within `budget`. */
function takeTokens(tokens: readonly string[], budget: number): string {
  let used = 0;
  let out = '';
  for (const t of tokens) {
    const len = tokenLength(t);
    if (used + len > budget) break;
    used += len;
    out += t;
  }
  return out;
}

function totalLength(tokens: readonly string[]): number {
  let n = 0;
  for (const t of tokens) n += tokenLength(t);
  return n;
}

/** Escape, then cut to `max` code points: the first `max - 3` followed by '...'. Never cuts inside a token. */
export function compact(s: string, max: number = COMPACT_MAX): string {
  const tokens = tokenize(s, false);
  if (totalLength(tokens) <= max) return tokens.join('');
  return `${takeTokens(tokens, max - 3)}...`;
}

/** Escape (newlines kept), then cut at DETAIL_MAX code points and append '[truncated]'. */
export function detail(s: string, max: number = DETAIL_MAX): string {
  const tokens = tokenize(s, true);
  if (totalLength(tokens) <= max) return tokens.join('');
  return `${takeTokens(tokens, max)}[truncated]`;
}
