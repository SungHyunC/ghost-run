// Feature: ghost-hand, Property 7: Overlay coverage and failure marking
// **Validates: Requirements 13.3, 13.8**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildOverlayViewModel, type FailureReason } from '../../src/overlay/view-model.js';
import type { GhostHandVariantResult, OverlayInput } from '../../src/pipeline/types.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config.js';

/** Optional flag: absent, false or true. */
const flagArb = fc.constantFrom<boolean | undefined>(undefined, false, true);

interface Spec {
  readonly success: boolean;
  readonly forbidden: boolean | undefined;
  readonly joint: boolean | undefined;
  readonly self: boolean | undefined;
  readonly frameLen: number;
}

const specArb: fc.Arbitrary<Spec> = fc.record({
  success: fc.boolean(),
  forbidden: flagArb,
  joint: flagArb,
  self: flagArb,
  frameLen: fc.integer({ min: 0, max: 6 }),
});

function buildInput(specs: readonly Spec[]): OverlayInput {
  return {
    variants: specs.map((s, i) => {
      const result: GhostHandVariantResult = {
        variantId: `variant-${i}`,
        success: s.success,
        ...(s.forbidden === undefined ? {} : { forbiddenContactOccurred: s.forbidden }),
        ...(s.joint === undefined ? {} : { jointLimitExceeded: s.joint }),
        ...(s.self === undefined ? {} : { selfCollisionOccurred: s.self }),
      };
      return { id: `variant-${i}`, result, frames: new Float32Array(s.frameLen).fill(i + 1) };
    }),
    base: { frames: new Float32Array(3).fill(0.5) },
    bodyCount: 4,
    framesPerSecond: 30,
  };
}

function expectedReasons(s: Spec): FailureReason[] {
  const r: FailureReason[] = [];
  if (!s.success) r.push('unsuccessful');
  if (s.forbidden === true) r.push('forbidden-contact');
  if (s.joint === true) r.push('joint-limit');
  if (s.self === true) r.push('self-collision');
  return r;
}

function check(specs: readonly Spec[]): void {
  const input = buildInput(specs);
  const vm = buildOverlayViewModel(input);
  expect(vm.arms).toHaveLength(specs.length + 1);
  const base = vm.arms[0];
  expect(base?.id).toBe('base');
  expect(base?.kind).toBe('base');
  expect(base?.failed).toBe(false);
  expect(base?.frames).toBe(input.base.frames);
  expect(vm.arms.filter((a) => a.kind === 'base')).toHaveLength(1);
  specs.forEach((s, i) => {
    const arm = vm.arms[i + 1];
    const want = expectedReasons(s);
    expect(arm?.kind).toBe('ghost');
    expect(arm?.id).toBe(`variant-${i}`);
    expect(arm?.frames).toBe(input.variants[i]?.frames);
    expect(arm?.failed).toBe(want.length > 0);
    expect(arm?.reasons).toEqual(want);
    // Requirement 13.8: color is paired with a text label and an icon.
    expect(arm?.label.length).toBeGreaterThan(0);
    expect(arm?.icon.length).toBeGreaterThan(0);
  });
}

describe('Property 7 (GH-P7): Overlay coverage and failure marking', () => {
  it(
    'one base arm first, one ghost arm per variant in order, failed exactly on the four conditions',
    () => {
      fc.assert(
        fc.property(fc.array(specArb, { minLength: 1, maxLength: 20 }), (specs) => {
          check(specs);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT ?? 0,
  );

  it('fixed example: all four conditions hold, reasons keep the fixed order', () => {
    check([{ success: false, forbidden: true, joint: true, self: true, frameLen: 2 }]);
  });

  it('fixed example: success with all optional flags absent is not failed', () => {
    check([{ success: true, forbidden: undefined, joint: undefined, self: undefined, frameLen: 0 }]);
  });

  it('fixed example: only a joint limit fails a successful variant', () => {
    check([
      { success: true, forbidden: false, joint: true, self: false, frameLen: 1 },
      { success: true, forbidden: false, joint: false, self: false, frameLen: 1 },
    ]);
  });
});
