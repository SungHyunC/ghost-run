// Feature: ui-kit, Property 8: Totality (static leg, S leg)
// **Validates: Requirements 2.5, 2.6, 14.2, 14.3, 14.7**
import { createElement, type ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { BlacklightView } from '../../src/components/BlacklightView';
import { Candle } from '../../src/components/Candle';
import { Graveyard } from '../../src/components/Graveyard';
import { KitRoot } from '../../src/components/KitRoot';
import { MirrorWorld } from '../../src/components/MirrorWorld';
import { RedThreadView } from '../../src/components/RedThreadView';
import { SeanceView } from '../../src/components/SeanceView';
import { buildBlacklightModel } from '../../src/model/blacklight';
import { buildCandleModel } from '../../src/model/candle';
import { buildClaimModel } from '../../src/model/claims';
import { buildGraveyardModel } from '../../src/model/graveyard';
import { buildMirrorModel } from '../../src/model/mirror';
import { flattenGeneric, redactGenericValue } from '../../src/model/redact';
import { buildSceneTree } from '../../src/model/scene';
import { buildSeanceModel } from '../../src/model/seance';
import { buildRedThreadModel } from '../../src/model/thread';
import {
  blacklightSource,
  breakOne,
  changes,
  circularValue,
  claims,
  deepValue,
  genericValue,
  graveEntry,
  needle,
  sceneValue,
  threadLink,
  wardVerdict,
} from '../fixtures/arbitraries';
import { renderMarkup } from '../support/markup';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

type Rec = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is object => typeof v === 'object' && v !== null;

/** Freeze a value and everything reachable from it (cycle safe). */
function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (!isObj(value) || seen.has(value)) return value;
  seen.add(value);
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (desc && 'value' in desc) deepFreeze(desc.value, seen);
  }
  return value;
}

/** Replace the value at a path chosen by `ns` (walks down while containers are non-empty). */
function replaceDeep(v: unknown, r: unknown, ns: readonly number[]): unknown {
  if (!isObj(v)) return r;
  const keys = Object.keys(v);
  if (keys.length === 0) return r;
  const k = keys[(ns[0] ?? 0) % keys.length] as string;
  const copy: Rec | unknown[] = Array.isArray(v) ? [...(v as unknown[])] : { ...(v as Rec) };
  (copy as Rec)[k] = ns.length > 1 ? replaceDeep((v as Rec)[k], r, ns.slice(1)) : r;
  return copy;
}

function breakDeep<T>(valid: fc.Arbitrary<T>): fc.Arbitrary<unknown> {
  return fc
    .tuple(valid, fc.jsonValue(), fc.array(fc.nat(), { minLength: 1, maxLength: 5 }))
    .map(([v, r, ns]) => replaceDeep(v, r, ns));
}

/** Valid, top-level broken, deeply broken, and raw JSON values. */
function mixed<T>(valid: fc.Arbitrary<T>): fc.Arbitrary<unknown> {
  return fc.oneof(
    { weight: 3, arbitrary: valid as fc.Arbitrary<unknown> },
    { weight: 3, arbitrary: breakOne(valid) },
    { weight: 3, arbitrary: breakDeep(valid) },
    { weight: 2, arbitrary: fc.jsonValue() },
    { weight: 1, arbitrary: fc.oneof(circularValue, deepValue()) as fc.Arbitrary<unknown> },
  );
}

const noop = (): void => undefined;

/** Component props: a record whose one field is replaced, or any JSON value as props. */
function propsArb(valid: fc.Arbitrary<Rec>): fc.Arbitrary<Rec> {
  const rec = (v: unknown): Rec => (isObj(v) && !Array.isArray(v) ? { ...(v as Rec) } : { value: v });
  return fc.oneof(
    { weight: 3, arbitrary: valid },
    { weight: 3, arbitrary: breakOne(valid).map(rec) },
    { weight: 3, arbitrary: breakDeep(valid).map(rec) },
    { weight: 2, arbitrary: fc.jsonValue().map(rec) },
    { weight: 1, arbitrary: fc.constant<Rec>({}) },
  );
}

// ---------------------------------------------------------------------------
// Valid props per component
// ---------------------------------------------------------------------------

const labels = fc.array(fc.stringMatching(/^[a-z][a-z ]{0,12}$/), { maxLength: 4 });
const mirrorProps: fc.Arbitrary<Rec> = fc
  .record(
    { changes, stepLabels: labels, realScene: sceneValue(), mirrorScene: sceneValue() },
    { requiredKeys: ['changes'] },
  )
  .map((r) => r as Rec);
const candleProps: fc.Arbitrary<Rec> = fc
  .record({ verdict: wardVerdict, claims }, { requiredKeys: [] })
  .map((r) => r as Rec);
const blacklightProps: fc.Arbitrary<Rec> = fc.record({ sources: fc.array(blacklightSource, { maxLength: 3 }) });
const threadProps: fc.Arbitrary<Rec> = fc
  .integer({ min: 0, max: 4 })
  .chain((n) =>
    fc.record(
      {
        needles: fc.array(needle, { minLength: n, maxLength: n }),
        links: fc.array(threadLink, { minLength: n, maxLength: n }),
        actionLabels: fc.array(fc.stringMatching(/^[a-z ]{1,10}$/), { maxLength: 4 }),
      },
      { requiredKeys: ['needles', 'links'] },
    ),
  )
  .map((r) => r as Rec);
const graveyardProps: fc.Arbitrary<Rec> = fc.record({
  entries: fc.array(graveEntry, { maxLength: 5 }),
  onOpenSeance: fc.constant(noop),
});
const seanceProps: fc.Arbitrary<Rec> = fc.record({ entry: graveEntry, onBack: fc.constant(noop) });
const kitRootProps: fc.Arbitrary<Rec> = fc.record(
  { initialTheme: fc.constantFrom('dark', 'light') },
  { requiredKeys: [] },
) as fc.Arbitrary<Rec>;

// ---------------------------------------------------------------------------
// Component table
// ---------------------------------------------------------------------------

interface Spec {
  readonly name: string;
  readonly component: ComponentType<never>;
  readonly props: fc.Arbitrary<Rec>;
  /** KitRoot children are a React node, not data: they are never generated. */
  readonly stripChildren: boolean;
}

const SPECS: readonly Spec[] = [
  { name: 'MirrorWorld', component: MirrorWorld as ComponentType<never>, props: propsArb(mirrorProps), stripChildren: false },
  { name: 'Candle', component: Candle as ComponentType<never>, props: propsArb(candleProps), stripChildren: false },
  { name: 'BlacklightView', component: BlacklightView as ComponentType<never>, props: propsArb(blacklightProps), stripChildren: false },
  { name: 'RedThreadView', component: RedThreadView as ComponentType<never>, props: propsArb(threadProps), stripChildren: false },
  { name: 'Graveyard', component: Graveyard as ComponentType<never>, props: propsArb(graveyardProps), stripChildren: false },
  { name: 'SeanceView', component: SeanceView as ComponentType<never>, props: propsArb(seanceProps), stripChildren: false },
  { name: 'KitRoot', component: KitRoot as ComponentType<never>, props: propsArb(kitRootProps), stripChildren: true },
];

function render(spec: Spec, props: Rec): string {
  const p: Rec = { ...props };
  if (spec.stripChildren) delete p['children'];
  return renderMarkup(createElement(spec.component as ComponentType<Rec>, p));
}

const placeholderFor = (name: string): string =>
  `<div role="alert" class="gk-placeholder">Data unavailable: ${name} received unreadable input.</div>`;

// ---------------------------------------------------------------------------
// Components render totally
// ---------------------------------------------------------------------------

describe('UI-P8 totality (static leg): components', () => {
  for (const spec of SPECS) {
    it(`UI-P8: ${spec.name} renders without throwing, as normal output or exactly the Placeholder, deterministically on frozen props`, () => {
      console.log(`PBT seed=${PBT_SEED}`);
      const counter = createCounter(`UI-P8 ${spec.name}`);
      fc.assert(
        fc.property(spec.props, (props) => {
          const frozen = deepFreeze(props);
          const first = render(spec, frozen);
          const second = render(spec, frozen);
          expect(second).toBe(first);
          const count = (first.match(/gk-placeholder/g) ?? []).length;
          if (spec.name === 'KitRoot') {
            // The Placeholder sits next to the toggle; the root and the toggle stay.
            expect(first).toContain('class="gk-root"');
            if (count > 0) {
              expect(count).toBe(1);
              expect(first).toContain(placeholderFor('KitRoot'));
              counter.add('placeholder');
            } else {
              counter.add('normal');
            }
          } else if (spec.name === 'SeanceView' && first !== placeholderFor(spec.name)) {
            // Normal output: a part with unreadable detail embeds the Placeholder of the child that drew it.
            const nested = first.match(/<div role="alert" class="gk-placeholder">[^<]*<\/div>/g) ?? [];
            expect(nested.length).toBe(count);
            for (const n of nested) {
              expect(n).toMatch(
                /^<div role="alert" class="gk-placeholder">Data unavailable: (MirrorWorld|Candle|BlacklightView|RedThreadView) received unreadable input\.<\/div>$/,
              );
            }
            counter.add(count > 0 ? 'placeholder' : 'normal');
          } else if (count > 0) {
            expect(first).toBe(placeholderFor(spec.name));
            counter.add('placeholder');
          } else {
            expect(first.length).toBeGreaterThan(0);
            expect(first).not.toContain('Data unavailable');
            counter.add('normal');
          }
        }),
        params('full'),
      );
      counter.print();
      assertBucketsHit(counter, ['placeholder', 'normal']);
    }, PBT_TIMEOUT);
  }
});

// ---------------------------------------------------------------------------
// Unreadable list elements
// ---------------------------------------------------------------------------

const nonRecord: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.integer(),
  fc.string({ maxLength: 6 }),
  fc.boolean(),
);

interface ListCase {
  readonly name: string;
  readonly spec: Spec;
  /** Valid props with a non-empty list and the index of the list element to damage. */
  readonly arb: fc.Arbitrary<{ props: Rec; index: number; siblings: number }>;
}

function listCase(
  name: string,
  spec: Spec,
  valid: fc.Arbitrary<Rec>,
  list: (p: Rec) => unknown[],
  setList: (p: Rec, l: unknown[]) => Rec,
  minLength = 1,
): ListCase {
  return {
    name,
    spec,
    arb: fc.tuple(valid, nonRecord, fc.nat()).chain(([p, bad, pick]) => {
      const items = list(p);
      if (items.length < minLength) return fc.constant({ props: p, index: -1, siblings: 0 });
      const index = pick % items.length;
      const copy = [...items];
      copy[index] = bad;
      return fc.constant({ props: setList(p, copy), index, siblings: items.length - 1 });
    }),
  };
}

const spec = (name: string): Spec => SPECS.find((s) => s.name === name) as Spec;

const LIST_CASES: readonly ListCase[] = [
  listCase(
    'MirrorWorld change element',
    spec('MirrorWorld'),
    mirrorProps.map((p) => ({ ...p, changes: [(p['changes'] as unknown[][]).flat()] })),
    (p) => (p['changes'] as unknown[][])[0] ?? [],
    (p, l) => ({ ...p, changes: [l] }),
  ),
  listCase(
    'Candle violation',
    spec('Candle'),
    fc.record({ verdict: wardVerdict }) as fc.Arbitrary<Rec>,
    (p) => (p['verdict'] as { violations: unknown[] }).violations,
    (p, l) => ({ verdict: { ...(p['verdict'] as Rec), violations: l } }),
  ),
  listCase(
    'Candle notice',
    spec('Candle'),
    fc.record({ verdict: wardVerdict }) as fc.Arbitrary<Rec>,
    (p) => (p['verdict'] as { notices: unknown[] }).notices,
    (p, l) => ({ verdict: { ...(p['verdict'] as Rec), notices: l } }),
  ),
  listCase(
    'BlacklightView source',
    spec('BlacklightView'),
    blacklightProps,
    (p) => p['sources'] as unknown[],
    (p, l) => ({ ...p, sources: l }),
  ),
  listCase(
    'RedThreadView link',
    spec('RedThreadView'),
    threadProps,
    (p) => p['links'] as unknown[],
    (p, l) => ({ ...p, links: l }),
  ),
  listCase(
    'Graveyard entry',
    spec('Graveyard'),
    graveyardProps,
    (p) => p['entries'] as unknown[],
    (p, l) => ({ ...p, entries: l }),
  ),
];

describe('UI-P8 totality (static leg): unreadable list elements', () => {
  for (const c of LIST_CASES) {
    it(`UI-P8: ${c.name} that is unreadable shows Unreadable item <index> while siblings render`, () => {
      console.log(`PBT seed=${PBT_SEED}`);
      const counter = createCounter(`UI-P8 list ${c.name}`);
      fc.assert(
        fc.property(c.arb, ({ props, index, siblings }) => {
          if (index < 0) return; // no list element to damage in this example
          const html = render(c.spec, deepFreeze(props));
          expect(html).not.toContain('gk-placeholder');
          const found = [...html.matchAll(/Unreadable item (\d+)/g)].map((m) => Number(m[1]));
          expect(found.length).toBeGreaterThan(0);
          expect(found.every((n) => n === index)).toBe(true);
          counter.add(siblings > 0 ? 'with-siblings' : 'alone');
          if (c.name === 'MirrorWorld change element') {
            expect((html.match(/data-change-row=/g) ?? []).length).toBe(siblings + 1);
          }
          if (c.name === 'Graveyard entry') {
            // One tombstone per entry: the unreadable one and every sibling.
            expect(html).toContain(`${siblings + 1} blocked commands`);
          }
        }),
        params('full'),
      );
      counter.print();
      assertBucketsHit(counter, ['with-siblings']);
    }, PBT_TIMEOUT);
  }
});

// ---------------------------------------------------------------------------
// Builders are total, pure, and never mutate
// ---------------------------------------------------------------------------

const noReveal = { lines: new Set<number>(), findings: new Set<number>() };
const allReveal = {
  lines: new Set<number>([0, 1, 2, 3, 4, 5]),
  findings: new Set<number>([0, 1, 2, 3, 4, 5]),
};

interface BuilderCase {
  readonly name: string;
  readonly input: fc.Arbitrary<unknown>;
  readonly build: (v: unknown) => unknown;
}

const BUILDERS: readonly BuilderCase[] = [
  { name: 'buildMirrorModel', input: mixed(mirrorProps), build: buildMirrorModel },
  { name: 'buildCandleModel', input: mixed(wardVerdict), build: buildCandleModel },
  { name: 'buildClaimModel', input: mixed(claims), build: buildClaimModel },
  {
    name: 'buildBlacklightModel',
    input: mixed(fc.array(blacklightSource, { maxLength: 3 })),
    build: (v) => [buildBlacklightModel(v, 'on', noReveal), buildBlacklightModel(v, 'off', allReveal)],
  },
  { name: 'buildGraveyardModel', input: mixed(fc.array(graveEntry, { maxLength: 5 })), build: buildGraveyardModel },
  { name: 'buildSeanceModel', input: mixed(graveEntry), build: buildSeanceModel },
  { name: 'buildRedThreadModel', input: mixed(threadProps), build: buildRedThreadModel },
  { name: 'buildSceneTree', input: mixed(sceneValue()), build: buildSceneTree },
  {
    name: 'redactGenericValue',
    input: mixed(genericValue(6)),
    build: (v) => flattenGeneric(redactGenericValue(v, null)),
  },
];

describe('UI-P8 totality (model leg inside the static file): builders', () => {
  for (const b of BUILDERS) {
    it(`UI-P8: ${b.name} never throws, is deterministic on frozen input, and returns ok or unreadable`, () => {
      console.log(`PBT seed=${PBT_SEED}`);
      const counter = createCounter(`UI-P8 ${b.name}`);
      fc.assert(
        fc.property(b.input, (input) => {
          const frozen = deepFreeze(input);
          const first = b.build(frozen);
          const second = b.build(frozen);
          expect(second).toEqual(first);
          const outs = Array.isArray(first) && b.name === 'buildBlacklightModel' ? first : [first];
          for (const out of outs) {
            if (isObj(out) && !Array.isArray(out) && 'kind' in out) {
              const kind = (out as { kind: unknown }).kind;
              expect(['ok', 'unreadable']).toContain(kind);
              counter.add(kind === 'ok' ? 'normal' : 'placeholder');
            } else {
              counter.add('normal');
            }
          }
        }),
        params('full'),
      );
      counter.print();
      assertBucketsHit(counter, ['normal']);
    }, PBT_TIMEOUT);
  }
});
