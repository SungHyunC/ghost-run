// Feature: ghost-runner, Property 11: Serialization round trip and idempotence
// Validates: Requirements 14.5, 14.6
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type RunResult, parseRunResult, redact, serializeRunResult } from '../src/result.js';
import { runResultArb } from './arbitraries/run-result.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

let executed = 0;

describe('Property 11: Serialization round trip and idempotence', () => {
  it('parse(serialize(r)) deep-equals redact(r); re-serializing the parsed value is identical', () => {
    fc.assert(
      fc.property(runResultArb, (r) => {
        executed++;
        const s1 = serializeRunResult(r);
        const parsed = parseRunResult(s1);
        expect(parsed).toEqual(redact(r));
        expect(serializeRunResult(parsed as unknown as RunResult)).toBe(s1);
      }),
      pbtParams(false),
    );
    console.log(`Property 11: runs executed=${executed} (mode=${PBT_MODE}, NUM_RUNS=${NUM_RUNS})`);
  }, testTimeoutMs(false));
});
