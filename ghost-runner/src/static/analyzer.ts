import { posix } from 'node:path';
import { parse } from 'shell-quote';
import type { Effect } from '@ghost-run/core';

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

const isUnderWork = (p: string): boolean => {
  const n = posix.normalize(p);
  return n === WORK_ROOT || n.startsWith(`${WORK_ROOT}/`);
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

export function analyze(action: AnalyzableAction): Effect[] {
  const effects: Effect[] = [];
  const seen = new Set<string>();
  const add = (kind: 'external-path' | 'url' | 'db-connection', destination: string): void => {
    const key = `${kind}\u0000${destination}`;
    if (seen.has(key)) return;
    seen.add(key);
    effects.push({ kind, destination });
  };

  // Keep variable references literal so `$HOME/x` is not silently dropped.
  const entries = parse(action.command, (name: string) => `$${name}`);

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
      else if (cand.startsWith('/') && !isUnderWork(cand)) add('external-path', cand);
    }
  }

  return effects;
}
