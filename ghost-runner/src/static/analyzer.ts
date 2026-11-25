import { posix } from 'node:path';
import { parse } from 'shell-quote';
import type { Effect } from '@ghost-run/core';
import { isHarmlessDevicePath } from './devices.js';

/**
 * Static (Plan B / effectsOutside) analysis of one shell action.
 *
 * Pure: no fs, net, dns, or child_process use. Findings are not deduplicated
 * against observed events; only identical (kind, destination) pairs within one
 * action are collapsed.
 */

const WORK_ROOT = '/work';

const DB_SCHEMES = [
  'postgres',
  'postgresql',
  'mysql',
  'mariadb',
  'mongodb',
  'mongodb+srv',
  'redis',
  'rediss',
  'amqp',
  'amqps',
];

// scheme://rest, up to whitespace, quotes, or shell metacharacters.
const URL_RE = /\b([a-z][a-z0-9+.-]*):\/\/[^\s'"`<>|;&()\\]+/gi;

/** Effect kind recorded when the command text cannot be parsed. */
export const UNPARSEABLE_KIND = 'unparseable-command';

const isUnder = (n: string, root: string): boolean => n === root || n.startsWith(`${root}/`);

/** True when `p`, after normalization, is the Copy root, an Original root, or a path under one. */
const isInside = (p: string, originalRoots: readonly string[]): boolean => {
  const n = posix.normalize(p);
  return isUnder(n, WORK_ROOT) || originalRoots.some((r) => isUnder(n, posix.normalize(r)));
};

/** Candidate path strings in a token: the token itself and any `--opt=value` / `VAR=value` tail. */
const pathCandidates = (token: string): string[] => {
  const out = [token];
  const eq = token.indexOf('=');
  if (eq > 0 && !token.includes('://')) out.push(token.slice(eq + 1));
  return out;
};

export interface AnalyzableAction {
  readonly command: string;
}

/**
 * `originalRoots`: absolute paths of the Original (as given and real path). A path at or under one
 * counts as inside, like the Copy root. Passed in because this function does no file I/O.
 */
export function analyze(action: AnalyzableAction, originalRoots: readonly string[] = []): Effect[] {
  const effects: Effect[] = [];
  const seen = new Set<string>();
  const add = (kind: 'external-path' | 'url' | 'db-connection' | typeof UNPARSEABLE_KIND, destination: string): void => {
    const key = `${kind}\u0000${destination}`;
    if (seen.has(key)) return;
    seen.add(key);
    effects.push({ kind, destination });
  };

  // Keep variable references literal so `$HOME/x` is not silently dropped.
  // shell-quote throws on some malformed input (e.g. `${`). The analyzer must never throw:
  // the command is reported as unparseable (which raises the verdict to at least warn) and
  // URLs are still extracted from the raw text. The destination never contains command text.
  let entries: ReturnType<typeof parse>;
  try {
    entries = parse(action.command, (name: string) => `$${name}`);
  } catch (e) {
    const reason = e instanceof Error && e.message.length > 0 ? e.message.slice(0, 80) : 'parse error';
    add(UNPARSEABLE_KIND, `unparseable shell command (${reason})`);
    entries = [];
    for (const m of action.command.matchAll(URL_RE)) {
      const scheme = (m[1] ?? '').toLowerCase();
      add(DB_SCHEMES.includes(scheme) ? 'db-connection' : 'url', m[0]);
    }
  }

  for (const entry of entries) {
    if (typeof entry !== 'string') continue;

    const urlSpans: Array<[number, number]> = [];
    for (const m of entry.matchAll(URL_RE)) {
      const scheme = (m[1] ?? '').toLowerCase();
      add(DB_SCHEMES.includes(scheme) ? 'db-connection' : 'url', m[0]);
      urlSpans.push([m.index, m.index + m[0].length]);
    }
    if (urlSpans.length > 0) continue;

    for (const cand of pathCandidates(entry)) {
      if (cand.startsWith('~')) add('external-path', cand);
      else if (cand.startsWith('/') && !isInside(cand, originalRoots) && !isHarmlessDevicePath(cand)) add('external-path', cand);
    }
  }

  return effects;
}
