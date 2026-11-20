import { sanitizeJudgeText } from '@ghost-run/core';
import type { Effect } from '@ghost-run/core';
import type { Action } from './types.js';

const HOST_RE = /^https?:\/\/([A-Za-z0-9.-]+)(:[0-9]+)?(\/.*)?$/;

/** One network effect for an action with `--endpoint-url`, else none. No I/O. */
export function effectsOutsideAction(a: Action): Effect[] {
  if (a.kind === 'unsupported') return [];
  const raw = a.endpointUrl;
  if (raw === undefined) return [];
  const text = String(raw);
  const m = HOST_RE.exec(text);
  const destination = m !== null ? (m[1] as string) : sanitizeJudgeText(text, 120);
  return [{ kind: 'network', destination }];
}
