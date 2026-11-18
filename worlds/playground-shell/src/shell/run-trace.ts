// The trace handed to handlers: the single choke point for secret reads.

import { compilePathSet } from '@ghost-run/core';
import type { TraceBuilder } from '../trace.js';
import type { VirtualPath } from '../state.js';
import type { RunTrace } from './interpret.js';

/**
 * `recordRead` tests the path against the secret patterns (case-insensitive)
 * and appends a `secret-read` event, deduped per (stepIndex, path). With no
 * patterns nothing is recorded.
 */
export function createRunTrace(
  builder: TraceBuilder,
  stepIndex: number,
  secretPatterns: readonly string[],
): RunTrace {
  const secrets = secretPatterns.length === 0 ? null : compilePathSet(secretPatterns, { caseSensitive: false });
  return {
    recordRead(path: VirtualPath): void {
      if (secrets === null) return;
      if (secrets.test(path).matched) builder.recordRead(stepIndex, path);
    },
    recordNetwork(destination: string, body?: Uint8Array): void {
      builder.recordNetwork(stepIndex, destination, body);
    },
    markWatchdog(): void {
      builder.markWatchdog();
    },
  };
}
