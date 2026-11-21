import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldId } from '../../src/config';
import { PAGE_IDS, type PageId } from '../../src/data/pages';
import type { LiveAnswer, LiveEngine, LiveLoaders } from '../../src/live/types';
import { drain } from '../lib/live-fakes';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

// Feature: site-pages, Property Pg7: Nothing heavy loads before its page is near
// **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8**

// App takes no loaders prop, so the default loaders are replaced by spies the test installs per run.
const slot = vi.hoisted(() => ({ current: null as null | { light: () => Promise<unknown>; hand: () => Promise<unknown> } }));
vi.mock('../../src/live/loaders', () => ({
  defaultLoaders: {
    light: () => (slot.current as NonNullable<typeof slot.current>).light(),
    hand: () => (slot.current as NonNullable<typeof slot.current>).hand(),
  },
}));

import { App } from '../../src/App';

const real = { replaceState: window.history.replaceState.bind(window.history) };

function fakeEngine(world: WorldId): LiveEngine & { warmSpy: ReturnType<typeof vi.fn> } {
  const warmSpy = vi.fn(() => Promise.resolve());
  return {
    world,
    warm: warmSpy,
    warmSpy,
    run: (): Promise<LiveAnswer> => Promise.resolve({ status: 'failed', cause: 'internal' }),
    dispose: vi.fn(),
  };
}

function setup() {
  const shell = fakeEngine('shell');
  const worker = vi.fn();
  const fetchSpy = vi.fn(() => Promise.reject(new Error('no network in this test')));
  const observer = vi.fn();
  const handWorker = vi.fn();
  const loaders = {
    // The real light loader creates the SQL worker once; the fake does the same so the count is observable.
    light: vi.fn(() => {
      new (worker as unknown as new (n: string) => unknown)('sql');
      return Promise.resolve({ shell, cloud: fakeEngine('cloud'), dispose: vi.fn() });
    }),
    hand: vi.fn(() => {
      new (handWorker as unknown as new (n: string) => unknown)('sim');
      return Promise.resolve(fakeEngine('hand'));
    }),
  } satisfies LiveLoaders;
  slot.current = loaders;
  vi.stubGlobal('Worker', worker);
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('IntersectionObserver', observer);
  return { loaders, shell, worker, handWorker, fetchSpy, observer };
}

type Op =
  | { kind: 'open'; page: PageId }
  | { kind: 'pick'; world: WorldId }
  | { kind: 'replay' }
  | { kind: 'step'; k: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...PAGE_IDS).map<Op>((page) => ({ kind: 'open', page })) },
  { weight: 2, arbitrary: fc.constantFrom<WorldId>('shell', 'cloud', 'hand').map<Op>((world) => ({ kind: 'pick', world })) },
  { weight: 1, arbitrary: fc.constant<Op>({ kind: 'replay' }) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 4 }).map<Op>((k) => ({ kind: 'step', k })) },
);

function openPage(container: HTMLElement, page: PageId) {
  fireEvent.click(container.querySelectorAll('#pgDots .pg-dot')[PAGE_IDS.indexOf(page)] as Element);
}

function current(container: HTMLElement): PageId {
  const el = container.querySelector('#pages > .page.on') as HTMLElement;
  return el.dataset['page'] as PageId;
}

/** Runs a sequence and checks the loading rules after every operation. */
async function runSequence(ops: readonly Op[], first: PageId | null): Promise<void> {
  // Every run starts on the cover: the previous run left its page in the address.
  real.replaceState(null, '', window.location.pathname);
  const { loaders, shell, worker, handWorker, fetchSpy, observer } = setup();
  const { container, unmount } = render(<App />);
  try {
    await drain();
    let nearSeen = false;
    let handPicked = false;
    const check = () => {
      expect(observer).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      if (!nearSeen) {
        expect(loaders.light).not.toHaveBeenCalled();
        expect(loaders.hand).not.toHaveBeenCalled();
        expect(worker).not.toHaveBeenCalled();
        expect(handWorker).not.toHaveBeenCalled();
      } else {
        expect(loaders.light).toHaveBeenCalledTimes(1);
        expect(worker).toHaveBeenCalledTimes(1);
        expect(shell.warmSpy).toHaveBeenCalledTimes(1);
      }
      expect(loaders.hand).toHaveBeenCalledTimes(handPicked ? 1 : 0);
      expect(handWorker).toHaveBeenCalledTimes(handPicked ? 1 : 0);
    };
    check();
    const all: Op[] = first === null ? [...ops] : [{ kind: 'open', page: first }, ...ops];
    for (const op of all) {
      const page = current(container);
      if (op.kind === 'open') {
        act(() => {
          openPage(container, op.page);
        });
        if (op.page === 'costumes' || op.page === 'run') nearSeen = true;
      } else if (page === 'run') {
        // The controls sit on the run page; a visitor cannot reach them from another page.
        if (op.kind === 'pick') {
          fireEvent.click(container.querySelector(`.tab[data-w="${op.world}"]`) as Element);
          if (op.world === 'hand') handPicked = true;
        } else if (op.kind === 'replay') fireEvent.click(container.querySelector('#replay') as Element);
        else fireEvent.click(container.querySelector(`#rail [data-s="${String(op.k)}"]`) as Element);
      }
      await drain();
      check();
    }
  } finally {
    unmount();
  }
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  real.replaceState(null, '', window.location.pathname);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'matchMedia');
  slot.current = null;
  real.replaceState(null, '', window.location.pathname);
});

describe('Property Pg7: nothing heavy loads before its page is near', () => {
  it(
    'loads the Light engine once after costumes or run opens, the Hand engine only after a Ghost Hand pick',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(opArb, { maxLength: 14 }), async (ops) => {
          await runSequence(ops, null);
          cleanup();
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('holds for any first page followed by any sequence', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...PAGE_IDS), fc.array(opArb, { maxLength: 10 }), async (first, ops) => {
        await runSequence(ops, first);
        cleanup();
      }),
      { numRuns: Math.min(NUM_RUNS, 50) },
    );
  }, PBT_TIMEOUT);

  const examples: [string, PageId[]][] = [
    ['cover, recipe, costumes', ['cover', 'recipe', 'costumes']],
    ['cover, recipe, costumes, run', ['cover', 'recipe', 'costumes', 'run']],
  ];
  for (const [name, pages] of examples) {
    it(`example: ${name}`, async () => {
      await runSequence(
        pages.map((page) => ({ kind: 'open', page })),
        null,
      );
    });
  }

  for (const page of PAGE_IDS) {
    it(`example: the first opening is ${page}`, async () => {
      await runSequence([], page);
      const near = page === 'costumes' || page === 'run';
      // Re-check the end state explicitly for the single opening.
      const { loaders } = setup();
      const { container } = render(<App />);
      await drain();
      act(() => {
        openPage(container, page);
      });
      await drain();
      expect(loaders.light).toHaveBeenCalledTimes(near ? 1 : 0);
      expect(loaders.hand).not.toHaveBeenCalled();
    });
  }

  it('has no showcase module in the module graph of App and creates no IntersectionObserver', () => {
    const src = resolve(__dirname, '../../src');
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g)) {
        const base = resolve(dirname(file), m[1] as string);
        const file2 = [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find((c) => existsSync(c));
        if (file2 !== undefined) walk(file2);
      }
    };
    walk(resolve(src, 'App.tsx'));
    const files = [...seen];
    expect(files.length).toBeGreaterThan(10);
    expect(files.filter((f) => f.includes('/showcase/'))).toEqual([]);
  });
});
