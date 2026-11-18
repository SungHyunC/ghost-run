import { describe, expectTypeOf, it } from 'vitest';
import type {
  Change,
  Effect,
  EvaluateInputs,
  FileChange,
  FingerprintResult,
  ObservedEvent,
  Scene,
  SecretValues,
  Snapshot,
  SqlRowCountChange,
  VariantResult,
  Ward,
  WardNotice,
  World,
} from '../src/types.js';

type S = { n: number };
type A = { op: string };

// A complete implementation: every one of the six methods present.
class FullWorld {
  snapshot(): Promise<Snapshot<S>> {
    throw new Error('type-only');
  }
  step(s: Snapshot<S>, _a: A): Promise<Snapshot<S>> {
    return Promise.resolve(s);
  }
  diff(_before: Snapshot<S>, _after: Snapshot<S>): Change[] {
    return [];
  }
  render(_s: Snapshot<S>): Scene {
    return {};
  }
  fingerprint(): Promise<FingerprintResult> {
    throw new Error('type-only');
  }
  effectsOutside(_a: A): Effect[] {
    return [];
  }
}

// Each class below omits exactly one method.
class NoSnapshot {
  step = FullWorld.prototype.step;
  diff = FullWorld.prototype.diff;
  render = FullWorld.prototype.render;
  fingerprint = FullWorld.prototype.fingerprint;
  effectsOutside = FullWorld.prototype.effectsOutside;
}
class NoStep {
  snapshot = FullWorld.prototype.snapshot;
  diff = FullWorld.prototype.diff;
  render = FullWorld.prototype.render;
  fingerprint = FullWorld.prototype.fingerprint;
  effectsOutside = FullWorld.prototype.effectsOutside;
}
class NoDiff {
  snapshot = FullWorld.prototype.snapshot;
  step = FullWorld.prototype.step;
  render = FullWorld.prototype.render;
  fingerprint = FullWorld.prototype.fingerprint;
  effectsOutside = FullWorld.prototype.effectsOutside;
}
class NoRender {
  snapshot = FullWorld.prototype.snapshot;
  step = FullWorld.prototype.step;
  diff = FullWorld.prototype.diff;
  fingerprint = FullWorld.prototype.fingerprint;
  effectsOutside = FullWorld.prototype.effectsOutside;
}
class NoFingerprint {
  snapshot = FullWorld.prototype.snapshot;
  step = FullWorld.prototype.step;
  diff = FullWorld.prototype.diff;
  render = FullWorld.prototype.render;
  effectsOutside = FullWorld.prototype.effectsOutside;
}
class NoEffectsOutside {
  snapshot = FullWorld.prototype.snapshot;
  step = FullWorld.prototype.step;
  diff = FullWorld.prototype.diff;
  render = FullWorld.prototype.render;
  fingerprint = FullWorld.prototype.fingerprint;
}

describe('World<S, A> contract', () => {
  it('accepts a class implementing all six methods', () => {
    expectTypeOf<FullWorld>().toMatchTypeOf<World<S, A>>();
    const w: World<S, A> = new FullWorld();
    expectTypeOf(w).toEqualTypeOf<World<S, A>>();
  });

  it('rejects a class missing any one of the six methods', () => {
    expectTypeOf<NoSnapshot>().not.toMatchTypeOf<World<S, A>>();
    expectTypeOf<NoStep>().not.toMatchTypeOf<World<S, A>>();
    expectTypeOf<NoDiff>().not.toMatchTypeOf<World<S, A>>();
    expectTypeOf<NoRender>().not.toMatchTypeOf<World<S, A>>();
    expectTypeOf<NoFingerprint>().not.toMatchTypeOf<World<S, A>>();
    expectTypeOf<NoEffectsOutside>().not.toMatchTypeOf<World<S, A>>();

    // @ts-expect-error missing snapshot
    const _a: World<S, A> = new NoSnapshot();
    // @ts-expect-error missing step
    const _b: World<S, A> = new NoStep();
    // @ts-expect-error missing diff
    const _c: World<S, A> = new NoDiff();
    // @ts-expect-error missing render
    const _d: World<S, A> = new NoRender();
    // @ts-expect-error missing fingerprint
    const _e: World<S, A> = new NoFingerprint();
    // @ts-expect-error missing effectsOutside
    const _f: World<S, A> = new NoEffectsOutside();
    void [_a, _b, _c, _d, _e, _f];
  });
});

describe('Snapshot', () => {
  it('has a readonly id', () => {
    const snap: Snapshot<S> = { id: 'a', state: { n: 1 }, result: { success: true } };
    // @ts-expect-error id is readonly
    snap.id = 'b';
    expectTypeOf<Snapshot<S>['id']>().toEqualTypeOf<string>();
  });
});

describe('Scene', () => {
  it('round-trips through JSON without type errors', () => {
    const scene: Scene = { title: 'x', items: [1, 'two', null, { ok: true }] };
    const back: Scene = JSON.parse(JSON.stringify(scene)) as Scene;
    expectTypeOf(back).toEqualTypeOf<Scene>();
  });
});

describe('FingerprintResult', () => {
  it('has manifest typed Readonly<Record<string, string>>', () => {
    expectTypeOf<FingerprintResult['manifest']>().toEqualTypeOf<
      Readonly<Record<string, string>>
    >();
    const fp: FingerprintResult = { hash: 'h', manifest: { a: 'b' } };
    // @ts-expect-error manifest entries are readonly
    fp.manifest['a'] = 'c';
  });
});

describe('core type extensions', () => {
  it('FileChange accepts symlink-changed with optional targets', () => {
    const c: FileChange = {
      kind: 'symlink-changed',
      path: 'a',
      targetBefore: 'x',
      targetAfter: 'y',
    };
    const plain: FileChange = { kind: 'file-deleted', path: 'a' };
    void [c, plain];
    expectTypeOf<FileChange['targetBefore']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<FileChange['targetAfter']>().toEqualTypeOf<string | undefined>();
    // @ts-expect-error unknown kind
    const bad: FileChange = { kind: 'file-moved', path: 'a' };
    void bad;
  });

  it('SqlRowCountChange has optional dropped', () => {
    const c: SqlRowCountChange = {
      kind: 'sql-row-count',
      table: 't',
      rowsBefore: 1,
      rowsAfter: 0,
    };
    void c;
    expectTypeOf<SqlRowCountChange['dropped']>().toEqualTypeOf<boolean | undefined>();
  });

  it('ObservedEvent has optional eventId', () => {
    const e: ObservedEvent = { kind: 'network-attempt', stepIndex: 0 };
    void e;
    expectTypeOf<ObservedEvent['eventId']>().toEqualTypeOf<string | undefined>();
  });

  it('SecretValues and EvaluateInputs have the hand-off shape', () => {
    expectTypeOf<SecretValues>().toEqualTypeOf<ReadonlyMap<string, Uint8Array>>();
    const empty: EvaluateInputs = {};
    const full: EvaluateInputs = {
      secretValues: new Map([['.env', new Uint8Array(1)]]),
      payloads: new Map([['e1', new Uint8Array(1)]]),
    };
    void [empty, full];
    expectTypeOf<EvaluateInputs['secretValues']>().toEqualTypeOf<SecretValues | undefined>();
    expectTypeOf<EvaluateInputs['payloads']>().toEqualTypeOf<
      ReadonlyMap<string, Uint8Array> | undefined
    >();
  });

  it('path Ward has optional case_sensitive; other variants do not', () => {
    type PathWard = Extract<Ward, { kind: 'path' }>;
    expectTypeOf<PathWard['case_sensitive']>().toEqualTypeOf<boolean | undefined>();
    const w: Ward = { id: 'p', kind: 'path', deny: ['delete'], paths: ['a'] };
    const w2: Ward = { id: 'p', kind: 'path', deny: ['delete'], paths: ['a'], case_sensitive: true };
    void [w, w2];
    expectTypeOf<Extract<Ward, { kind: 'sql' }>>().not.toHaveProperty('case_sensitive');
    expectTypeOf<Extract<Ward, { kind: 'egress' }>>().not.toHaveProperty('case_sensitive');
    expectTypeOf<Extract<Ward, { kind: 'physics' }>>().not.toHaveProperty('case_sensitive');
  });

  it('WardNotice.kind is widened', () => {
    expectTypeOf<WardNotice['kind']>().toEqualTypeOf<
      'effect-outside' | 'observed-event' | 'content-inspection' | 'path-escape'
    >();
  });
});

describe('VariantResult physics hard-failure flags', () => {
  it('has optional jointLimitExceeded and selfCollisionOccurred like forbiddenContactOccurred', () => {
    expectTypeOf<VariantResult['jointLimitExceeded']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<VariantResult['selfCollisionOccurred']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<VariantResult['forbiddenContactOccurred']>().toEqualTypeOf<boolean | undefined>();
    const minimal: VariantResult = { variantId: 'v', success: true };
    const full: VariantResult = {
      variantId: 'v',
      success: false,
      jointLimitExceeded: true,
      selfCollisionOccurred: true,
    };
    void [minimal, full];
  });
});
