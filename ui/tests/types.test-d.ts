import { describe, expectTypeOf, it } from 'vitest';
import type { Change, Needle, Scene, ScanResult, SecretValues, EvaluateInputs, ThreadLink, WardVerdict } from '@ghost-run/core';
import type {
  BlacklightSource,
  BlacklightViewProps,
  CandleProps,
  GraveDetail,
  GraveEntry,
  GraveyardProps,
  IsolationClaims,
  KitRootProps,
  MirrorWorldProps,
  RedThreadViewProps,
  SeanceViewProps,
} from '../src/types';

// EvaluateInputs has only optional keys, so any object is assignable to it; it is detected by its key names instead.
type EvaluateInputsKeys = keyof EvaluateInputs;
// Walks object, array, and union members (not function parameters) up to a fixed depth.
type Forbidden = SecretValues | Uint8Array | ReadonlyMap<unknown, unknown> | Map<unknown, unknown>;
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
type HasForbidden<T> = true extends Walk<T> ? true : false;
// Distributes over union members, so an optional property (`X | undefined`) is checked member by member.
type Walk<T, D extends number = 9> = [D] extends [never]
  ? false
  : T extends unknown
    ? [T] extends [never]
      ? false
      : [T] extends [Forbidden]
        ? true
        : T extends (...args: never[]) => unknown
          ? false
          : T extends readonly (infer E)[]
            ? Walk<E, Prev[D]>
            : T extends object
              ? [Extract<keyof T, EvaluateInputsKeys>] extends [never]
                ? { [K in keyof T]-?: Walk<T[K], Prev[D]> }[keyof T]
                : true
              : false
    : never;

// Structural copy of the ghost-runner `Isolation` field list (ghost-runner/src/result.ts).
// The kit cannot import ghost-runner, so the copy is written out here.
interface GhostRunnerIsolationCopy {
  mode: 'docker-box' | 'static-analysis';
  reason?: 'docker-unavailable' | 'box-image-missing';
  p1Claimed: boolean;
  p5Claimed: boolean;
  p6Claimed: boolean;
  originalUnchanged?: boolean;
  readOnlyMounts: string[];
  mountAuditPassed?: boolean;
}

describe('ui input types', () => {
  it('detector flags the forbidden shapes', () => {
    expectTypeOf<HasForbidden<{ a: SecretValues }>>().toEqualTypeOf<true>();
    expectTypeOf<HasForbidden<{ a: readonly { b: EvaluateInputs }[] }>>().toEqualTypeOf<true>();
    expectTypeOf<HasForbidden<{ a: { secretValues?: SecretValues } }>>().toEqualTypeOf<true>();
    expectTypeOf<HasForbidden<{ a?: Uint8Array }>>().toEqualTypeOf<true>();
    expectTypeOf<HasForbidden<{ a: Map<string, number> }>>().toEqualTypeOf<true>();
    expectTypeOf<HasForbidden<{ a: string; b: readonly number[] }>>().toEqualTypeOf<false>();
  });

  it('no input type contains SecretValues, EvaluateInputs, Uint8Array, or Map', () => {
    expectTypeOf<HasForbidden<MirrorWorldProps>>().toEqualTypeOf<false>();
    expectTypeOf<HasForbidden<CandleProps>>().toEqualTypeOf<false>();
    expectTypeOf<HasForbidden<BlacklightViewProps>>().toEqualTypeOf<false>();
    expectTypeOf<HasForbidden<RedThreadViewProps>>().toEqualTypeOf<false>();
    expectTypeOf<HasForbidden<GraveyardProps>>().toEqualTypeOf<false>();
    expectTypeOf<HasForbidden<SeanceViewProps>>().toEqualTypeOf<false>();
    expectTypeOf<HasForbidden<KitRootProps>>().toEqualTypeOf<false>();
    expectTypeOf<HasForbidden<GraveEntry>>().toEqualTypeOf<false>();
    expectTypeOf<HasForbidden<GraveDetail>>().toEqualTypeOf<false>();
    expectTypeOf<HasForbidden<IsolationClaims>>().toEqualTypeOf<false>();
    expectTypeOf<HasForbidden<BlacklightSource>>().toEqualTypeOf<false>();
  });

  it('a structural copy of the ghost-runner Isolation is assignable to IsolationClaims', () => {
    expectTypeOf<GhostRunnerIsolationCopy>().toExtend<IsolationClaims>();
    expectTypeOf<IsolationClaims['mode']>().toEqualTypeOf<'docker-box' | 'static-analysis' | 'playground'>();
  });

  it('MirrorWorldProps matches the input table', () => {
    expectTypeOf<MirrorWorldProps>().toEqualTypeOf<{
      readonly changes: readonly (readonly Change[])[];
      readonly realScene?: Scene;
      readonly mirrorScene?: Scene;
      readonly stepLabels?: readonly string[];
    }>();
  });

  it('CandleProps matches the input table', () => {
    expectTypeOf<CandleProps>().toEqualTypeOf<{
      readonly verdict?: WardVerdict;
      readonly claims?: IsolationClaims;
    }>();
  });

  it('BlacklightViewProps matches the input table', () => {
    expectTypeOf<BlacklightViewProps>().toEqualTypeOf<{
      readonly sources: readonly { readonly source: string; readonly text: string; readonly scan: ScanResult }[];
    }>();
  });

  it('RedThreadViewProps matches the input table', () => {
    expectTypeOf<RedThreadViewProps>().toEqualTypeOf<{
      readonly needles: readonly Needle[];
      readonly links: readonly ThreadLink[];
      readonly actionLabels?: readonly string[];
    }>();
  });

  it('GraveyardProps matches the input table', () => {
    expectTypeOf<GraveyardProps>().toEqualTypeOf<{
      readonly entries: readonly GraveEntry[];
      readonly onOpenSeance: (id: string) => void;
    }>();
  });

  it('SeanceViewProps matches the input table', () => {
    expectTypeOf<SeanceViewProps>().toEqualTypeOf<{
      readonly entry: GraveEntry;
      readonly onBack: () => void;
    }>();
  });

  it('KitRootProps takes an optional initialTheme', () => {
    expectTypeOf<KitRootProps['initialTheme']>().toEqualTypeOf<'dark' | 'light' | undefined>();
  });
});
