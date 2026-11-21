// Shared drift helpers (tasks 7.2 and 7.7): render the Showcase's kit parts with the kit components
// and the data of showcase/sample-data.ts, and compare them with the parts of the real gallery.
import { createElement, useState } from 'react';
import type { ReactElement } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { BlacklightView, Candle, Graveyard, KitRoot, MirrorWorld, RedThreadView, SeanceView } from '@ghost-run/ui';
import type * as SampleData from '../../src/showcase/sample-data';

export type ShowcaseData = Pick<
  typeof SampleData,
  | 'blacklightSources'
  | 'needles'
  | 'links'
  | 'actionLabels'
  | 'changes'
  | 'stepLabels'
  | 'realScene'
  | 'mirrorScene'
  | 'CANDLE_STATES'
  | 'entries'
>;

/** The data that the parts render, as one plain object (what `structuredClone` can copy). */
export function pickData(module: ShowcaseData): ShowcaseData {
  return {
    blacklightSources: module.blacklightSources,
    needles: module.needles,
    links: module.links,
    actionLabels: module.actionLabels,
    changes: module.changes,
    stepLabels: module.stepLabels,
    realScene: module.realScene,
    mirrorScene: module.mirrorScene,
    CANDLE_STATES: module.CANDLE_STATES,
    entries: module.entries,
  };
}

function GraveyardPart({ data }: { data: ShowcaseData }): ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data.entries.find((e) => e.id === openId);
  return open === undefined
    ? createElement(Graveyard, { entries: data.entries, onOpenSeance: setOpenId })
    : createElement(SeanceView, { entry: open, onBack: () => setOpenId(null) });
}

/** Renders the Showcase's kit parts in the same structure as the gallery's `main`. Returns the `main`. */
export function renderShowcaseParts(data: ShowcaseData): { main: HTMLElement; unmount: () => void } {
  const candles = data.CANDLE_STATES.map((s) =>
    createElement(Candle, {
      key: s.id,
      ...(s.verdict === undefined ? {} : { verdict: s.verdict }),
      ...(s.claims === undefined ? {} : { claims: s.claims }),
    }),
  );
  const { container, unmount } = render(
    createElement(
      KitRoot,
      null,
      createElement(
        'main',
        null,
        createElement(MirrorWorld, {
          changes: data.changes,
          realScene: data.realScene,
          mirrorScene: data.mirrorScene,
          stepLabels: data.stepLabels,
        }),
        createElement('section', null, candles),
        createElement(BlacklightView, { sources: data.blacklightSources }),
        createElement(RedThreadView, { needles: data.needles, links: data.links, actionLabels: data.actionLabels }),
        createElement(GraveyardPart, { data }),
      ),
    ),
  );
  const main = container.querySelector('main');
  if (main === null) throw new Error('Showcase parts did not render a main element');
  return { main, unmount };
}

/** Replaces the useId tokens of id, for, aria-labelledby, and aria-controls by numbered placeholders. */
export function normalizeIds(html: string): string {
  const seen = new Map<string, string>();
  const token = (raw: string): string => {
    let n = seen.get(raw);
    if (n === undefined) {
      n = `ID${String(seen.size)}`;
      seen.set(raw, n);
    }
    return n;
  };
  // A useId token holds the delimiters of React ("r0", with colons or guillemets around it).
  const isUseId = (v: string): boolean => /^(_r_[0-9a-z]+_|[:\u00ab]r[0-9a-z]+[:\u00bb])(-[\w-]+)?$/.test(v);
  return html.replace(/\b(id|for|aria-labelledby|aria-controls)="([^"]*)"/g, (all, attr: string, value: string) => {
    const parts = value.split(' ');
    if (!parts.every(isUseId)) return all;
    return `${attr}="${parts.map(token).join(' ')}"`;
  });
}

export interface KitParts {
  candles: Map<string, string>;
  mirror: string;
  blacklight: string;
  thread: string;
  graveyard: string;
}

function html(el: Element | null, what: string): string {
  if (el === null) throw new Error(`Part not found: ${what}`);
  return new XMLSerializer().serializeToString(el);
}

/** Serialized outerHTML of each kit part inside a `main`. */
export function collectParts(main: Element): KitParts {
  const candles = new Map<string, string>();
  for (const c of main.querySelectorAll('section.gk-candle')) {
    const key = `${c.getAttribute('data-candle-state') ?? ''}|${c.getAttribute('aria-label') ?? ''}`;
    candles.set(key, html(c, key));
  }
  const top = [...main.querySelectorAll(':scope > section')];
  const mirror = top.find((s) => s.classList.contains('gk-section') && s.querySelector('table.gk-table') !== null) ?? null;
  const blacklight = main.querySelector(':scope > section[data-blacklight]');
  const thread = main.querySelector(':scope > section[aria-label="Red thread"]');
  const grave =
    top.find((s) => s.classList.contains('gk-section') && s.querySelector(':scope > h2')?.textContent === 'Graveyard') ?? null;
  return {
    candles,
    mirror: html(mirror, 'mirror'),
    blacklight: html(blacklight, 'blacklight'),
    thread: html(thread, 'red thread'),
    graveyard: html(grave, 'graveyard'),
  };
}

function same(label: string, a: string, b: string): void {
  const x = normalizeIds(a);
  const y = normalizeIds(b);
  if (x === y) return;
  let i = 0;
  while (i < x.length && x[i] === y[i]) i += 1;
  const around = (t: string): string => t.slice(Math.max(0, i - 60), i + 60);
  throw new Error(`Drift in ${label} at ${String(i)}:\n gallery:  ${around(x)}\n showcase: ${around(y)}`);
}

/** Opens the tombstone `index` and returns the seance section's outerHTML; goes back afterwards. */
function seanceOf(main: Element, index: number): string {
  const tombs = main.querySelectorAll<HTMLElement>('button.gk-tombstone');
  const tomb = tombs[index];
  if (tomb === undefined) throw new Error(`Tombstone ${String(index)} not found`);
  act(() => {
    fireEvent.click(tomb);
  });
  const out = html(main.querySelector(':scope > section.gk-seance'), `seance ${String(index)}`);
  const back = main.querySelector<HTMLElement>(':scope > section.gk-seance .gk-header button.gk-button');
  if (back === null) throw new Error('Back button of the seance not found');
  act(() => {
    fireEvent.click(back);
  });
  return out;
}

/** Switches the blacklight on, returns its section's outerHTML, and switches it off again. */
function blacklightOn(main: Element): string {
  const sw = main.querySelector<HTMLElement>(':scope > section[data-blacklight] button[role="switch"]');
  if (sw === null) throw new Error('Blacklight switch not found');
  act(() => {
    fireEvent.click(sw);
  });
  const out = html(main.querySelector(':scope > section[data-blacklight]'), 'blacklight on');
  act(() => {
    fireEvent.click(sw);
  });
  return out;
}

/** Throws when any kit part of the Showcase differs from the same part of the gallery. */
export function assertNoDrift(galleryMain: Element, showcaseMain: Element, seanceCount: number): void {
  const g = collectParts(galleryMain);
  const s = collectParts(showcaseMain);
  if (g.candles.size === 0) throw new Error('The gallery shows no candle');
  if ([...g.candles.keys()].join('\n') !== [...s.candles.keys()].join('\n')) {
    throw new Error(`Drift in candle labels:\n ${[...g.candles.keys()].join(' / ')}\n ${[...s.candles.keys()].join(' / ')}`);
  }
  for (const [key, value] of g.candles) same(`candle ${key}`, value, s.candles.get(key) ?? '');
  same('mirror', g.mirror, s.mirror);
  same('blacklight', g.blacklight, s.blacklight);
  same('blacklight on', blacklightOn(galleryMain), blacklightOn(showcaseMain));
  same('red thread', g.thread, s.thread);
  same('graveyard', g.graveyard, s.graveyard);
  for (let i = 0; i < seanceCount; i += 1) {
    same(`seance ${String(i)}`, seanceOf(galleryMain, i), seanceOf(showcaseMain, i));
  }
}
