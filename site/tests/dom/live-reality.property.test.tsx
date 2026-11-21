import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from '../../src/components/art/Sprite';
import { Walkthrough } from '../../src/components/Walkthrough';
import { CopyPane } from '../../src/components/walk/CopyPane';
import { RealityPane } from '../../src/components/walk/RealityPane';
import runsJson from '../../src/data/runs.json';
import { toWalkRuns } from '../../src/data/walk-records';
import { drain, failingLoaders, recordedLoaders } from '../lib/live-fakes';
import type { PlanRecord, RunsFile, WorldRecord } from '../../src/data/types';
import type { LiveAnswer, LiveEngine, LiveLoaders } from '../../src/live/types';
import type { WalkView } from '../../src/engine/types';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';
import { visibility } from '../lib/page-visibility';

const runsFile = runsJson as unknown as RunsFile;
const runs = toWalkRuns(runsFile);

beforeEach(() => {
  vi.useFakeTimers();
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
  | { type: 'preset'; index: number }
  | { type: 'run' }
  | { type: 'text'; value: string }
  | { type: 'slider'; key: 'speed' | 'force' | 'distance'; fraction: number }
  | { type: 'replay' }
  | { type: 'jump'; step: number }
  | { type: 'play' }
  | { type: 'wait'; ms: number };

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ type: fc.constant('pick' as const), world: fc.integer({ min: 0, max: 2 }) }),
  fc.record({ type: fc.constant('preset' as const), index: fc.integer({ min: 0, max: 2 }) }),
  fc.record({ type: fc.constant('run' as const) }),
  fc.record({ type: fc.constant('text' as const), value: fc.string({ maxLength: 40 }) }),
  fc.record({
    type: fc.constant('slider' as const),
    key: fc.constantFrom('speed' as const, 'force' as const, 'distance' as const),
    fraction: fc.double({ min: 0, max: 1, noNaN: true }),
  }),
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
  const hit = WORLDS.find((w) => screen.getByRole('tab', { name: new RegExp(w.name) }).getAttribute('aria-selected') === 'true');
  if (!hit) throw new Error('no world is selected');
  return hit.id;
}

type Mode = 'recorded' | 'live';

/** Fake engines that answer from the committed records and note every plan they return. */
function spyLoaders(answers: PlanRecord[]): LiveLoaders {
  const base = recordedLoaders(runsFile).loaders;
  const wrap = (engine: LiveEngine): LiveEngine => ({
    ...engine,
    run: async (input) => {
      const answer: LiveAnswer = await engine.run(input);
      if (answer.status === 'ran') answers.push(answer.run.plan);
      return answer;
    },
  });
  return {
    light: async () => {
      const light = await base.light();
      return { shell: wrap(light.shell), cloud: wrap(light.cloud), dispose: light.dispose };
    },
    hand: async () => wrap(await base.hand()),
  };
}

async function checkSequence(
  renderCopy: (record: WorldRecord, view: WalkView) => ReactNode,
  actions: Action[],
  mode: Mode,
): Promise<void> {
  const answers: PlanRecord[] = [];
  const { container } = render(
    <>
      <Sprite />
      <Walkthrough
        visibility={visibility('cover')}
        runs={runsFile}
        loaders={mode === 'live' ? spyLoaders(answers) : failingLoaders}
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
  let ranLive = false;
  const verify = (): void => {
    const rec = runs.worlds[currentWorld()];
    const html = serialize(realb());
    expect(html).toBe(atReset);
    expect(html).toBe(drawn(rec));
    if (mode === 'recorded' || !ranLive || answers.length === 0) {
      // Before any engine answer (no action yet, or a rejected input) the page shows a recorded final state.
      if (fpb().classList.contains('show')) expect(rec.plan.p1.equal).toBe(true);
      if (gob().classList.contains('show')) {
        expect(rec.fixed.verdict === 'pass' && rec.fixed.p1.equal).toBe(true);
      }
      return;
    }
    // Live: the badges follow the plans the engines returned for the displayed run.
    const last = answers[answers.length - 1];
    if (fpb().classList.contains('show')) {
      expect(answers.length).toBeGreaterThan(0);
      expect(answers.every((p) => p.p1.equal)).toBe(true);
    }
    if (gob().classList.contains('show')) {
      expect(last !== undefined && last.verdict === 'pass' && last.p1.equal).toBe(true);
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
        answers.length = 0;
        ranLive = true;
        fireEvent.click(screen.getByRole('tab', { name: new RegExp(WORLDS[a.world]?.name ?? '') }));
        await drain();
        reset();
        break;
      case 'preset': {
        const buttons = container.querySelectorAll<HTMLButtonElement>('#presets button');
        answers.length = 0;
        ranLive = true;
        fireEvent.click(buttons[a.index % buttons.length] as HTMLButtonElement);
        await drain();
        reset();
        break;
      }
      case 'run':
        answers.length = 0;
        ranLive = true;
        fireEvent.click(screen.getByRole('button', { name: /Run (ghost|8 ghosts)/ }));
        await drain();
        reset();
        break;
      case 'text': {
        const input = container.querySelector('#cmd') as HTMLInputElement;
        if (!input.hidden && !input.readOnly) fireEvent.change(input, { target: { value: a.value } });
        break;
      }
      case 'slider': {
        const id = { speed: 's-speed', force: 's-force', distance: 's-dist' }[a.key];
        const range = container.querySelector(`#${id}`) as HTMLInputElement;
        const lo = Number(range.min);
        const hi = Number(range.max);
        const step = Number(range.step);
        const value = lo + Math.round((a.fraction * (hi - lo)) / step) * step;
        if (!range.disabled) fireEvent.change(range, { target: { value: String(value) } });
        break;
      }
      case 'replay':
        fireEvent.click(screen.getByRole('button', { name: '↻ Replay' }));
        await drain();
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

async function runProperty(
  renderCopy: (record: WorldRecord, view: WalkView) => ReactNode,
  numRuns: number,
  mode: Mode,
): Promise<void> {
  await fc.assert(
    fc.asyncProperty(sequences, async (actions) => {
      try {
        await checkSequence(renderCopy, actions, mode);
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

describe('Property L2: Reality never changes (page form)', () => {
  // Feature: site-live, Property L2: Reality never changes
  // **Validates: Requirements 12.1, 12.3**
  for (const mode of ['recorded', 'live'] as const) {
    it(
      `the Reality pane content stays the drawn scene under any action sequence (${mode} runs)`,
      async () => {
        await runProperty(goodCopy, NUM_RUNS, mode);
      },
      PBT_TIMEOUT || undefined,
    );
  }

  it('mutation: a Copy pane that writes into the Reality pane makes the property fail', async () => {
    await expect(
      runProperty((record, view) => <BrokenCopy record={record} view={view} />, 20, 'live'),
    ).rejects.toThrow();
  });
});
