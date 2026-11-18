// Feature: ui-kit, Property 8: Totality
// **Validates: Requirements 14.2, 14.3, 14.4, 14.7**
import { createElement, type ComponentType } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { BlacklightView } from '../../src/components/BlacklightView';
import { Candle } from '../../src/components/Candle';
import { Graveyard } from '../../src/components/Graveyard';
import { KitBoundary } from '../../src/components/KitBoundary';
import { KitRoot } from '../../src/components/KitRoot';
import { MirrorWorld } from '../../src/components/MirrorWorld';
import type { ComponentName } from '../../src/components/Placeholder';
import { RedThreadView } from '../../src/components/RedThreadView';
import { SeanceView } from '../../src/components/SeanceView';
import {
  blacklightSource,
  breakOne,
  changes,
  claims,
  graveEntry,
  needle,
  sceneValue,
  threadLink,
  wardVerdict,
} from '../fixtures/arbitraries';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

type Rec = Record<string, unknown>;

const isObj = (v: unknown): v is object => typeof v === 'object' && v !== null;
const noop = (): void => undefined;

// ---------------------------------------------------------------------------
// Props generators (same shape as the static leg)
// ---------------------------------------------------------------------------

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

interface Spec {
  readonly name: ComponentName;
  readonly component: ComponentType<never>;
  readonly props: fc.Arbitrary<Rec>;
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

const placeholderText = (name: string): string => `Data unavailable: ${name} received unreadable input.`;
const PLACEHOLDER_NODE = /<div role="alert" class="gk-placeholder">([^<]*)<\/div>/g;

// ---------------------------------------------------------------------------
// Mount leg
// ---------------------------------------------------------------------------

describe('UI-P8 totality (DOM leg): mounting', () => {
  for (const spec of SPECS) {
    it(`UI-P8: ${spec.name} mounts without throwing, as normal output or the Placeholder`, () => {
      console.log(`PBT seed=${PBT_SEED}`);
      const counter = createCounter(`UI-P8 dom ${spec.name}`);
      fc.assert(
        fc.property(spec.props, (props) => {
          const p: Rec = { ...props };
          if (spec.stripChildren) delete p['children'];
          const { container, unmount } = render(createElement(spec.component as ComponentType<Rec>, p));
          try {
            const html = container.innerHTML;
            expect(html.length).toBeGreaterThan(0);
            const nodes = [...html.matchAll(PLACEHOLDER_NODE)];
            const count = (html.match(/gk-placeholder/g) ?? []).length;
            expect(nodes.length).toBe(count);
            for (const n of nodes) {
              expect(n[1]).toMatch(
                /^Data unavailable: (MirrorWorld|Candle|BlacklightView|RedThreadView|Graveyard|SeanceView|KitRoot) received unreadable input\.$/,
              );
            }
            if (spec.name !== 'KitRoot' && spec.name !== 'SeanceView' && count > 0) {
              // The whole component is replaced by exactly its own Placeholder.
              expect(count).toBe(1);
              expect(container.textContent).toBe(placeholderText(spec.name));
            }
            if (spec.name === 'KitRoot') expect(html).toContain('class="gk-root"');
            counter.add(count > 0 ? 'placeholder' : 'normal');
          } finally {
            unmount();
          }
        }),
        params('dom'),
      );
      counter.print();
      assertBucketsHit(counter, ['placeholder', 'normal']);
    }, PBT_TIMEOUT ?? 0);
  }
});

// ---------------------------------------------------------------------------
// A throwing child inside KitBoundary
// ---------------------------------------------------------------------------

const NAMES: readonly ComponentName[] = SPECS.map((s) => s.name);

describe('UI-P8 totality (DOM leg): KitBoundary', () => {
  it('UI-P8: a child that throws inside KitBoundary yields the Placeholder with no text from the error or the data', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter = createCounter('UI-P8 dom KitBoundary');
    const secret = fc.stringMatching(/^[A-Za-z0-9]{6,20}$/).map((s) => `sk-CANARY-${s}`);
    // React logs caught render errors to console.error; keep the output readable.
    const spy = vi.spyOn(console, 'error').mockImplementation(noop);
    try {
      fc.assert(
        fc.property(fc.constantFrom(...NAMES), secret, secret, fc.jsonValue(), (name, message, datum, extra) => {
          function Boom(props: { data: string; extra: unknown }): never {
            void props;
            throw new Error(message);
          }
          const { container, unmount } = render(
            createElement(
              'section',
              null,
              createElement(KitBoundary, { name }, createElement(Boom, { data: datum, extra })),
            ),
          );
          try {
            const text = container.textContent ?? '';
            const html = container.innerHTML;
            expect(text).toBe(placeholderText(name));
            expect((html.match(/gk-placeholder/g) ?? []).length).toBe(1);
            for (const leak of [message, datum, 'Error', 'at Boom']) {
              expect(html).not.toContain(leak);
            }
            counter.add(name);
          } finally {
            unmount();
          }
        }),
        params('dom'),
      );
    } finally {
      spy.mockRestore();
    }
    counter.print();
    assertBucketsHit(counter, []);
  }, PBT_TIMEOUT ?? 0);
});
