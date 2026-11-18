// Exit codes of ghost-hand-run (task 14.3, requirements 11.8, 11.9). Pure; shared by the entry point and its tests.
import type { Verdict } from '@ghost-run/core';

export const EXIT_PASS = 0;
export const EXIT_WARN = 1;
export const EXIT_BLOCK = 2;
export const EXIT_USAGE = 64;
export const EXIT_INVALID_INPUT = 65;
export const EXIT_INTERNAL = 70;

export function exitCodeFor(verdict: Verdict): number {
  if (verdict === 'pass') return EXIT_PASS;
  if (verdict === 'warn') return EXIT_WARN;
  return EXIT_BLOCK;
}
