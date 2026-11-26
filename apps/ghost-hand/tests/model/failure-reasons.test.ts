import { describe, expect, it } from 'vitest';
import { failureReasonsText } from '../../src/ui-text.js';
import type { FailureFacts } from '../../src/ui-text.js';

const ok: FailureFacts = {
  status: 'passed',
  drawerDisplacementM: 0.2,
  maxContactForceN: 5,
  vaseTouched: false,
  jointLimitExceeded: false,
  selfCollisionOccurred: false,
};
const TARGET = 0.1;

describe('failureReasonsText', () => {
  it('counts each reason once per ghost and joins them in a fixed order', () => {
    const missed: FailureFacts = { ...ok, status: 'failed', drawerDisplacementM: 0.01 };
    const joint: FailureFacts = { ...ok, status: 'failed', jointLimitExceeded: true };
    expect(failureReasonsText([ok, missed, joint], TARGET, 20)).toBe(
      '1 missed the drawer target \u00B7 1 hit a joint limit',
    );
  });

  it('counts a ghost with two reasons under both', () => {
    const both: FailureFacts = { ...ok, status: 'failed', drawerDisplacementM: 0.01, vaseTouched: true };
    const vase: FailureFacts = { ...ok, status: 'failed', vaseTouched: true };
    expect(failureReasonsText([both, vase], TARGET, 20)).toBe(
      '1 missed the drawer target \u00B7 2 touched the vase',
    );
  });

  it('reports force over the limit, ignores passed ghosts, and returns null without reasons', () => {
    const hard: FailureFacts = { ...ok, status: 'failed', maxContactForceN: 30 };
    expect(failureReasonsText([hard], TARGET, 20)).toBe('1 went over the force limit');
    expect(failureReasonsText([{ ...ok, vaseTouched: true }], TARGET, 20)).toBeNull();
    expect(failureReasonsText([hard], TARGET, null)).toBeNull();
  });
});
