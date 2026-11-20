// Input handling: the only way visitor text or slider values reach an adapter.

import { escapeForDisplay, isHiddenDisplay } from '@ghost-run/ui';
import { WORLD_CONFIG } from '@ghost-run/drawer-arm';

/** Code points. Below the app limits (4,096 Shell, 1,024 Cloud), so an app limit is never reached. */
export const TEXT_LIMIT = 256;

/** Code points shown of a rejected text before the ellipsis. */
export const ECHO_LIMIT = 80;

export type TextProblem = 'empty' | 'too-long' | 'invalid-character';

export type NormalizedText = { ok: true; text: string } | { ok: false; problem: TextProblem };

export interface SliderValues {
  speed: number;
  force: number;
  distance: number;
}

export type NormalizedSliders = { ok: true; values: SliderValues } | { ok: false; problem: 'out-of-range' };

function isControl(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
}

function isSurrogate(cp: number): boolean {
  return cp >= 0xd800 && cp <= 0xdfff;
}

/** Removes leading and trailing U+0020 only. Tabs, newlines, and hidden code points stay, so they are rejected. */
function trimSpaces(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end && raw.charCodeAt(start) === 0x20) start++;
  while (end > start && raw.charCodeAt(end - 1) === 0x20) end--;
  return raw.slice(start, end);
}

/**
 * Trims space characters and checks the text. Rejects an empty text, a text of more than
 * TEXT_LIMIT code points, and a text with a control, hidden, or unpaired-surrogate code point.
 */
export function normalizeText(raw: string): NormalizedText {
  const text = trimSpaces(raw);
  if (text === '') return { ok: false, problem: 'empty' };
  let count = 0;
  let invalid = false;
  for (const ch of text) {
    count++;
    const cp = ch.codePointAt(0) ?? 0;
    if (isControl(cp) || isHiddenDisplay(cp) || isSurrogate(cp)) invalid = true;
  }
  if (invalid) return { ok: false, problem: 'invalid-character' };
  if (count > TEXT_LIMIT) return { ok: false, problem: 'too-long' };
  return { ok: true, text };
}

function clampTo(v: number, range: readonly [number, number]): number {
  return Math.min(range[1], Math.max(range[0], v));
}

/** Rounds to `digits` decimals (0 for an integer). */
function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/**
 * Clamps each value to the action ranges of the drawer-arm world, then rounds speed and distance to
 * two decimals and force to an integer. NaN and infinite values are out of range.
 */
export function normalizeSliders(v: SliderValues): NormalizedSliders {
  if (![v.speed, v.force, v.distance].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { ok: false, problem: 'out-of-range' };
  }
  const r = WORLD_CONFIG.actionRanges;
  return {
    ok: true,
    values: {
      speed: clampTo(roundTo(clampTo(v.speed, r.speed), 2), r.speed),
      force: clampTo(roundTo(clampTo(v.force, r.force), 0), r.force),
      distance: clampTo(roundTo(clampTo(v.distance, r.distance), 2), r.distance),
    },
  };
}

/** Splits an escaped string into display tokens: one `<U+XXXX>` notation or one code point. */
const TOKEN_RE = /<U\+[0-9A-F]{4,6}>|[\s\S]/gu;

/**
 * The only way a rejected text is shown: every control and hidden code point as `<U+XXXX>`,
 * at most ECHO_LIMIT code points, then an ellipsis. Never cuts inside a notation.
 */
export function echo(raw: string): string {
  const tokens = escapeForDisplay(raw).match(TOKEN_RE) ?? [];
  let used = 0;
  let out = '';
  for (const t of tokens) {
    const len = t.length > 1 ? t.length : 1;
    if (used + len > ECHO_LIMIT) return `${out}\u2026`;
    used += len;
    out += t;
  }
  return out;
}

/** Commands of the Ghost Shell world, as shown to the visitor. A test compares them with the handler table. */
export const KNOWN_SHELL: readonly string[] = [
  'pwd',
  'ls',
  'cat',
  'echo',
  'mkdir',
  'touch',
  'rm',
  'mv',
  'cp',
  'find',
  'sqlite3',
  'curl',
  'npm',
  'true',
  'false',
];

/** The slider ranges of the Ghost Hand world, as shown to the visitor (read from the world config, never retyped). */
export const KNOWN_HAND: readonly string[] = [
  `speed ${String(WORLD_CONFIG.actionRanges.speed[0])} to ${String(WORLD_CONFIG.actionRanges.speed[1])} m/s`,
  `force ${String(WORLD_CONFIG.actionRanges.force[0])} to ${String(WORLD_CONFIG.actionRanges.force[1])} N`,
  `distance ${String(WORLD_CONFIG.actionRanges.distance[0])} to ${String(WORLD_CONFIG.actionRanges.distance[1])} m`,
];

/** Commands of the Ghost Cloud world, as shown to the visitor. A test compares them with the parser. */
export const KNOWN_CLOUD: readonly string[] = [
  'aws s3 ls',
  'aws s3 mb',
  'aws s3 rb',
  'aws s3 cp',
  'aws s3 rm',
  'aws s3api put-bucket-acl',
  'aws s3api put-public-access-block',
  'aws s3api delete-public-access-block',
];
