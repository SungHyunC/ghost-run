// Feature: site-pages, Property Pg5 (the Showcase renders the real kit components)
// **Validates: Requirements 14.1, 14.2, 14.3, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.13**
import { useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import fc from 'fast-check';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BlacklightView, Candle, Graveyard, KitRoot, MirrorWorld, RedThreadView, SeanceView } from '@ghost-run/ui';
import { ShowcaseApp } from '../../src/showcase/ShowcaseApp';
import {
  actionLabels,
  blacklightSources,
  CANDLE_STATES,
  changes,
  entries,
  links,
  mirrorScene,
  needles,
  realScene,
  stepLabels,
} from '../../src/showcase/sample-data';
import { collectParts, normalizeIds } from '../lib/drift';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

const ROWS = ['p-mirror', 'p-candle', 'p-blacklight', 'p-thread', 'p-grave', 'p-lights', 'p-controls'] as const;
type RowId = (typeof ROWS)[number];

const ser = (el: Element | null | undefined): string => {
  if (el === null || el === undefined) throw new Error('element not found');
  return normalizeIds(new XMLSerializer().serializeToString(el));
};
const rowEl = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(id);
  return el;
};
const click = (el: Element | null | undefined): void => {
  if (el === null || el === undefined) throw new Error('click target not found');
  act(() => {
    fireEvent.click(el);
  });
};
const SWITCH = ':scope > header button[role="switch"]';
const BL_SWITCH = ':scope > section[data-blacklight] button[role="switch"]';

type Op =
  | { kind: 'tab'; i: number }
  | { kind: 'blacklight' }
  | { kind: 'tomb'; i: number; back: boolean }
  | { kind: 'lights'; row: RowId; which: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant('tab' as const), i: fc.nat(CANDLE_STATES.length - 1) }),
  fc.record({ kind: fc.constant('blacklight' as const) }),
  fc.record({ kind: fc.constant('tomb' as const), i: fc.nat(entries.length - 1), back: fc.boolean() }),
  fc.record({ kind: fc.constant('lights' as const), row: fc.constantFrom(...ROWS), which: fc.nat(1) }),
);

function GraveReference() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = entries.find((e) => e.id === openId);
  return open === undefined ? (
    <Graveyard entries={entries} onOpenSeance={setOpenId} />
  ) : (
    <SeanceView
      entry={open}
      onBack={() => {
        setOpenId(null);
      }}
    />
  );
}

const candleProps = (i: number): Record<string, unknown> => {
  const s = CANDLE_STATES[i];
  return {
    ...(s?.verdict === undefined ? {} : { verdict: s.verdict }),
    ...(s?.claims === undefined ? {} : { claims: s.claims }),
  };
};

/** The real component of a row, alone, in its own KitRoot (the Candle row is rendered by `candleRef`). */
function referenceFor(id: RowId, tab: number): React.ReactElement {
  switch (id) {
    case 'p-mirror':
      return (
        <KitRoot>
          <MirrorWorld changes={changes} realScene={realScene} mirrorScene={mirrorScene} stepLabels={stepLabels} />
        </KitRoot>
      );
    case 'p-candle':
      return (
        <KitRoot>
          <Candle {...candleProps(tab)} />
        </KitRoot>
      );
    case 'p-blacklight':
      return (
        <KitRoot>
          <BlacklightView sources={blacklightSources} />
        </KitRoot>
      );
    case 'p-thread':
      return (
        <KitRoot>
          <RedThreadView needles={needles} links={links} actionLabels={actionLabels} />
        </KitRoot>
      );
    case 'p-grave':
      return (
        <KitRoot>
          <GraveReference />
        </KitRoot>
      );
    case 'p-lights':
      return (
        <div>
          <KitRoot initialTheme="dark">
            <Candle {...candleProps(0)} />
          </KitRoot>
          <KitRoot initialTheme="light">
            <Candle {...candleProps(0)} />
          </KitRoot>
        </div>
      );
    case 'p-controls':
      return <KitRoot />;
  }
}

/** Root elements of a row's Frame, and of the reference. */
const frameRoots = (id: RowId): Element[] => [...rowEl(id).querySelectorAll('.frame-body > .gk-root, .frame-body > .klights > .gk-root')];

/** The kit shell (root attributes and the header with the Lights switch) as markup. */
const shell = (root: Element): string => {
  const clone = root.cloneNode(false) as Element;
  const header = root.querySelector(':scope > header');
  if (header !== null) clone.appendChild(header.cloneNode(true));
  return ser(clone);
};

function assertRow(id: RowId, refRoots: Element[]): void {
  const roots = frameRoots(id);
  expect(roots.length).toBe(refRoots.length === 0 ? 1 : refRoots.length);
  if (id === 'p-controls') {
    // No kit component stands behind the form controls; the Frame holds the real KitRoot shell.
    expect(shell(roots[0] as Element)).toBe(shell(refRoots[0] as Element));
    return;
  }
  roots.forEach((r, k) => {
    const ref = refRoots[k] as Element;
    if (id === 'p-candle') {
      expect(shell(r)).toBe(shell(ref));
      expect(ser(r.querySelector('section.gk-candle'))).toBe(ser(ref.querySelector('section.gk-candle')));
    } else {
      expect(ser(r)).toBe(ser(ref));
    }
  });
}

afterEach(cleanup);

describe('Pg5: the Showcase renders the real kit components', () => {
  it(
    'every row matches the real component for the same props after any operation sequence',
    () => {
      fc.assert(
        fc.property(fc.array(opArb, { maxLength: 12 }), (ops) => {
          cleanup();
          const app = render(<ShowcaseApp />);
          const refs = new Map<RowId, ReturnType<typeof render>>();
          for (const id of ROWS) refs.set(id, render(referenceFor(id, 0)));
          const refRoots = (id: RowId): Element[] => [
            ...(refs.get(id) as ReturnType<typeof render>).container.querySelectorAll('.gk-root'),
          ];
          let tab = 0;
          const check = (): void => {
            for (const id of ROWS) assertRow(id, refRoots(id));
          };
          check();
          for (const op of ops) {
            if (op.kind === 'tab') {
              tab = op.i;
              click(within('p-candle').getAllByRole('tab')[op.i]);
              (refs.get('p-candle') as ReturnType<typeof render>).rerender(referenceFor('p-candle', tab));
            } else if (op.kind === 'blacklight') {
              click(frameRoots('p-blacklight')[0]?.querySelector(BL_SWITCH));
              click(refRoots('p-blacklight')[0]?.querySelector(BL_SWITCH));
            } else if (op.kind === 'tomb') {
              const open = (r: Element | undefined): void => {
                const tomb = r?.querySelectorAll('button.gk-tombstone')[op.i];
                if (tomb !== undefined) click(tomb); // while a seance shows, there is no list to open from
              };
              open(frameRoots('p-grave')[0]);
              open(refRoots('p-grave')[0]);
              if (op.back) {
                for (const r of [frameRoots('p-grave')[0], refRoots('p-grave')[0]]) {
                  click(r?.querySelector('section.gk-seance .gk-header button.gk-button'));
                }
              }
            } else {
              const k = op.row === 'p-lights' ? op.which : 0;
              click(frameRoots(op.row)[k]?.querySelector(SWITCH));
              click(refRoots(op.row)[k]?.querySelector(SWITCH));
            }
            check();
          }
          app.unmount();
          return true;
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('has no img element and no data: URL, whatever the operations', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 8 }), (ops) => {
        cleanup();
        const { container, unmount } = render(<ShowcaseApp />);
        for (const op of ops) {
          if (op.kind === 'tab') click(within('p-candle').getAllByRole('tab')[op.i]);
          else if (op.kind === 'blacklight') click(rowEl('p-blacklight').querySelector(BL_SWITCH.replace(':scope > ', '')));
          else if (op.kind === 'tomb') {
            const tomb = rowEl('p-grave').querySelectorAll('button.gk-tombstone')[op.i];
            if (tomb !== undefined) click(tomb);
          }
          else click(frameRoots(op.row)[op.which === 1 ? Math.min(1, frameRoots(op.row).length - 1) : 0]?.querySelector(SWITCH));
        }
        expect(container.querySelectorAll('img')).toHaveLength(0);
        expect(new XMLSerializer().serializeToString(container).includes('data:')).toBe(false);
        unmount();
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);
});

function within(id: string): { getAllByRole: (role: string) => HTMLElement[] } {
  return { getAllByRole: () => [...rowEl(id).querySelectorAll<HTMLElement>('[role="tab"]')] };
}

describe('Pg5: the Showcase parts equal the parts of the real gallery', () => {
  const root = document.createElement('div');
  root.id = 'root';
  let galleryMain: HTMLElement;

  beforeAll(async () => {
    document.body.appendChild(root);
    // @ts-expect-error TS5097 (the site tsconfig does not allow a .tsx extension; Vite resolves it)
    await import('../../../ui/gallery/main.tsx');
    await waitFor(() => {
      expect(root.querySelector('main')).not.toBeNull();
    });
    galleryMain = root.querySelector('main') as HTMLElement;
  });
  afterAll(() => {
    root.remove();
  });

  it('each row part is the gallery part, and each Candle tab is a gallery candle', () => {
    const g = collectParts(galleryMain);
    render(<ShowcaseApp />);
    const part = (id: string, sel: string): string => ser(rowEl(id).querySelector(sel));
    const gal = (s: string): string => normalizeIds(s);
    expect(part('p-mirror', 'section.gk-section')).toBe(gal(g.mirror));
    expect(part('p-blacklight', 'section[data-blacklight]')).toBe(gal(g.blacklight));
    expect(part('p-thread', 'section[aria-label="Red thread"]')).toBe(gal(g.thread));
    expect(part('p-grave', 'section.gk-section')).toBe(gal(g.graveyard));
    const galleryCandles = [...g.candles.values()];
    expect(galleryCandles).toHaveLength(CANDLE_STATES.length);
    CANDLE_STATES.forEach((_s, i) => {
      click(within('p-candle').getAllByRole('tab')[i]);
      expect(part('p-candle', 'section.gk-candle')).toBe(gal(galleryCandles[i] as string));
    });
  });
});
