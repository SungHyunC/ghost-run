// Feature: ghost-runner, Property 7: Configuration and plan bounds
// Validates: Requirements 6.1, 7.1, 7.3, 16.5
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveRunnerOptions, validatePlanSize } from '../src/config.js';
import { ConfigError, PlanBoundsError } from '../src/errors.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

let executed = 0;
const count = <T>(f: (x: T) => void) => (x: T) => {
  executed++;
  f(x);
};

const base = { original: '/tmp/ghost-original-fixture' };

function outcome(fn: () => unknown): 'accepted' | Error {
  try {
    fn();
    return 'accepted';
  } catch (e) {
    return e as Error;
  }
}

describe('Property 7: Configuration and plan bounds', () => {
  it('plan size n is accepted exactly when 1 <= n <= 50', () => {
    const n = fc.oneof(
      fc.integer({ min: -100, max: 200 }),
      fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
      fc.constantFrom(0, 1, 2, 49, 50, 51, -1),
    );
    fc.assert(
      fc.property(
        n,
        count((size: number) => {
          const r = outcome(() => validatePlanSize(size));
          if (size >= 1 && size <= 50) {
            expect(r).toBe('accepted');
          } else {
            expect(r).toBeInstanceOf(PlanBoundsError);
            const err = r as PlanBoundsError;
            expect(err.bound).toContain('1..50');
            expect(err.message).toContain('1..50');
            expect(err.actual).toBe(size);
          }
        }),
      ),
      pbtParams(),
    );
  }, testTimeoutMs(false));

  it('execLimitSec t is accepted exactly when 1 <= t <= 30', () => {
    const t = fc.oneof(
      fc.double({ min: -10, max: 60, noNaN: true }),
      fc.integer({ min: -5, max: 40 }),
      fc.constantFrom(0, 1, 30, 0.999, 30.001, Number.NaN, Infinity, -Infinity),
    );
    fc.assert(
      fc.property(
        t,
        count((limit: number) => {
          const r = outcome(() => resolveRunnerOptions({ ...base, execLimitSec: limit }));
          if (limit >= 1 && limit <= 30) {
            expect(r).toBe('accepted');
          } else {
            expect(r).toBeInstanceOf(ConfigError);
            const err = r as ConfigError;
            expect(err.option).toBe('execLimitSec');
            expect(err.bound).toContain('1..30');
          }
        }),
      ),
      pbtParams(),
    );
  }, testTimeoutMs(false));

  it('pool.size p is accepted exactly when p is an integer in 1..8', () => {
    const p = fc.oneof(
      fc.integer({ min: -5, max: 20 }),
      fc.double({ min: -5, max: 20, noNaN: true }),
      fc.constantFrom(0, 1, 8, 9, 1.5, 7.999, Number.NaN, Infinity),
    );
    fc.assert(
      fc.property(
        p,
        count((size: number) => {
          const r = outcome(() => resolveRunnerOptions({ ...base, pool: { size } }));
          if (Number.isInteger(size) && size >= 1 && size <= 8) {
            expect(r).toBe('accepted');
          } else {
            expect(r).toBeInstanceOf(ConfigError);
            const err = r as ConfigError;
            expect(err.option).toBe('pool.size');
            expect(err.bound).toContain('1..8');
          }
        }),
      ),
      pbtParams(),
    );
  }, testTimeoutMs(false));

  it('runId s is accepted exactly when it matches ^[A-Za-z0-9_-]{1,64}$', () => {
    const s = fc.oneof(
      fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/),
      fc.string({ maxLength: 80 }),
      fc.stringMatching(/^[A-Za-z0-9_-]{65,80}$/),
      fc.constantFrom('', 'a', 'a'.repeat(64), 'a'.repeat(65), 'a b', 'a.b', 'a/b', 'a:b', 'a\n'),
    );
    fc.assert(
      fc.property(
        s,
        count((runId: string) => {
          const r = outcome(() => resolveRunnerOptions({ ...base, runId }));
          if (/^[A-Za-z0-9_-]{1,64}$/.test(runId)) {
            expect(r).toBe('accepted');
            expect(resolveRunnerOptions({ ...base, runId }).runId).toBe(runId);
          } else {
            expect(r).toBeInstanceOf(ConfigError);
            const err = r as ConfigError;
            expect(err.option).toBe('runId');
            expect(err.bound).toContain('{1,64}');
          }
        }),
      ),
      pbtParams(),
    );
  }, testTimeoutMs(false));

  it('reports runs executed', () => {
    console.log(
      `Property 7: mode=${PBT_MODE}, NUM_RUNS per property=${NUM_RUNS}, total runs executed=${executed}`,
    );
    expect(executed).toBeGreaterThanOrEqual(4 * NUM_RUNS);
  });
});
