import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import { CopyPane } from '../../src/components/walk/CopyPane';
import { RealityPane } from '../../src/components/walk/RealityPane';
import runsJson from '../../src/data/runs.json';
import type { RunsFile, WorldRecord } from '../../src/data/types';
import type { WalkView } from '../../src/engine/types';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const runs = runsJson as unknown as RunsFile;

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type WorldId = 'shell' | 'hand' | 'cloud';
const WORLDS: { id: WorldId; name: string }[] = [
  { id: 'shell', name: 'Ghost Shell' },
  { id: 'hand', name: 'Ghost Hand' },
  { id: 'cloud', name: 'Ghost Cloud' },
];

type Action =
  | { type: 'pick'; world: number }
  | { type: 'replay' }
  | { type: 'jump'; step: number }
  | { type: 'play' }
  | { type: 'wait'; ms: number };

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ type: fc.constant('pick' as const), world: fc.integer({ min: 0, max: 2 }) }),
  fc.record({ type: fc.constant('replay' as const) }),
  fc.record({ type: fc.constant('jump' as const), step: fc.integer({ min: 0, max: 4 }) }),
  fc.record({ type: fc.constant('play' as const) }),
  fc.record({ type: fc.constant('wait' as const), ms: fc.integer({ min: 0, max: 20000 }) }),
);

/** Serialized content of an element (children only), through the DOM serializer. */
const serialize = (el: Element): string =>
  Array.from(el.childNodes)
    .map((n) => new XMLSerializer().serializeToString(n))
    .join('');

/** The drawn form of a scene: the pane rendered alone into its own container, serialized by the same DOM. */
function drawn(record: WorldRecord): string {
  const host = document.createElement('div');
  const view = render(<RealityPane scene={record.reality} />, { container: host });
  const html = serialize(host);
  view.unmount();
  return html;
}

function currentWorld(): WorldId {
  const hit = WORLDS.find((w) => screen.getByRole('button', { name: new RegExp(w.name) }).getAttribute('aria-pressed') === 'true');
  if (!hit) throw new Error('no world is selected');
  return hit.id;
}

function checkSequence(renderCopy: (record: WorldRecord, view: WalkView) => ReactNode, actions: Action[]): void {
  const { container } = render(
    <>
      <Sprite />
      <Walkthrough
        runs={runs}
        renderReality={(record) => <RealityPane scene={record.reality} />}
        renderCopy={renderCopy}
      />
    </>,
  );
  const realb = () => container.querySelector('#realb') as HTMLElement;
  const fpb = () => container.querySelector('#fpb') as HTMLElement;
  const gob = () => container.querySelector('#gob') as HTMLElement;
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  let atReset = '';
  const verify = (): void => {
    const rec = runs.worlds[currentWorld()];
    const html = serialize(realb());
    expect(html).toBe(atReset);
    expect(html).toBe(drawn(rec));
    if (fpb().classList.contains('show')) expect(rec.plan.p1.equal).toBe(true);
    if (gob().classList.contains('show')) {
      expect(rec.fixed.verdict === 'pass' && rec.fixed.p1.equal).toBe(true);
    }
  };
  const reset = (): void => {
    atReset = serialize(realb());
    expect(atReset).toBe(drawn(runs.worlds[currentWorld()]));
  };

  reset();
  verify();
  for (const a of actions) {
    switch (a.type) {
      case 'pick':
        fireEvent.click(screen.getByRole('button', { name: new RegExp(WORLDS[a.world]?.name ?? '') }));
        reset();
        break;
      case 'replay':
        fireEvent.click(screen.getByRole('button', { name: '↻ Replay' }));
        reset();
        break;
      case 'jump': {
        const buttons = screen.getAllByRole('listitem').map((li) => li.querySelector('button') as HTMLButtonElement);
        fireEvent.click(buttons[a.step] as HTMLButtonElement);
        break;
      }
      case 'play':
        advance(60000);
        break;
      case 'wait':
        advance(a.ms);
        break;
    }
    verify();
  }
}

const sequences = fc.array(actionArb, { minLength: 1, maxLength: 12 });

function runProperty(renderCopy: (record: WorldRecord, view: WalkView) => ReactNode, numRuns: number): void {
  fc.assert(
    fc.property(sequences, (actions) => {
      try {
        checkSequence(renderCopy, actions);
      } finally {
        cleanup();
      }
    }),
    { numRuns },
  );
}

const goodCopy = (record: WorldRecord, view: WalkView): ReactNode => (
  <CopyPane record={record} copy={view.copy} fixed={view.plan.rev} />
);

/** Deliberately broken: writes a node into the Reality pane whenever the copy changes. */
function BrokenCopy({ record, view }: { record: WorldRecord; view: WalkView }) {
  useEffect(() => {
    const real = document.getElementById('realb');
    if (real) {
      const mark = document.createElement('span');
      mark.setAttribute('data-leak', 'true');
      real.appendChild(mark);
    }
  });
  return goodCopy(record, view);
}

describe('Property 1: Reality never changes', () => {
  // Feature: site, Property 1: Reality never changes
  // **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5**
  it(
    'the Reality pane content stays the drawn recorded scene under any action sequence',
    () => {
      runProperty(goodCopy, NUM_RUNS);
    },
    PBT_TIMEOUT || undefined,
  );

  it('mutation: a Copy pane that writes into the Reality pane makes the property fail', () => {
    expect(() =>
      runProperty((record, view) => <BrokenCopy record={record} view={view} />, 20),
    ).toThrow();
  });
});
