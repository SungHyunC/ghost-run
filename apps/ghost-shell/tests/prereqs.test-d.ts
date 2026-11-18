import { describe, expectTypeOf, it } from 'vitest';
import type { WardNotice, WardVerdict } from '@ghost-run/core';
import type { CandleProps, IsolationClaims } from '../src/ui-imports';

describe('cross-spec prerequisites (types)', () => {
  it('accepts a core WardNotice, including unsupported-step, in the Candle input', () => {
    const notice: WardNotice = { kind: 'unsupported-step', reason: 'unsupported command, not rehearsed.', stepIndex: 0 };
    expectTypeOf(notice).toExtend<WardNotice>();
    expectTypeOf<WardVerdict>().toExtend<NonNullable<CandleProps['verdict']>>();
    expectTypeOf<WardVerdict['notices'][number]>().toEqualTypeOf<WardNotice>();
    const kind: WardNotice['kind'] = 'unsupported-step';
    expectTypeOf(kind).toExtend<WardNotice['kind']>();
  });

  it('accepts the playground mode and the unsupported-step reason in the claims', () => {
    expectTypeOf<{ mode: 'playground'; p1Claimed: true; p5Claimed: false; p6Claimed: false; reason: 'unsupported-step' }>()
      .toExtend<IsolationClaims>();
  });
});
