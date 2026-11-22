// The pure paging model: page state, the hash codec, and the transition function.
// No clock, no random source, no DOM. Imports only the page registry.

import { PAGE_IDS, type PageId } from '../data/pages';

export type Source = 'bar' | 'key' | 'swipe' | 'link' | 'hash' | 'held';
export type Direction = 'forward' | 'back';

export interface PagingState {
  /** The Current_Page; the target as soon as a Turn starts. */
  readonly current: PageId;
  /** The page that the Turn_Effect still shows. */
  readonly leaving: PageId | null;
  readonly direction: Direction | null;
  /** The last request that came during an effect. */
  readonly held: { readonly to: PageId; readonly source: Source } | null;
  /** True once the page was current. */
  readonly opened: Readonly<Record<PageId, boolean>>;
}

export type PagingEvent =
  | { readonly type: 'request'; readonly to: PageId; readonly source: Source; readonly reduced: boolean }
  /** `reduced` applies to a held request that runs now; it defaults to false. */
  | { readonly type: 'effect-end'; readonly reduced?: boolean }
  | { readonly type: 'bad-hash' };

export interface PagingEffects {
  readonly hash: 'push' | 'replace' | null;
  readonly startTimer: boolean;
  readonly announce: PageId | null;
  readonly scrollTop: boolean;
  /** Decided by the hook from the source and the active element. */
  readonly focusHeading: boolean;
}

export interface PageVisibility {
  readonly current: PageId;
  readonly opened: Readonly<Record<PageId, boolean>>;
}

/** The end of the longest turn animation (60 ms delay + 480 ms) plus a margin of 20 ms. */
export const EFFECT_MS = 560;

export const NO_EFFECTS: PagingEffects = {
  hash: null,
  startTimer: false,
  announce: null,
  scrollTop: false,
  focusHeading: false,
};

export function parseHash(hash: string): PageId | null {
  if (!hash.startsWith('#')) return null;
  const name = hash.slice(1);
  return PAGE_IDS.find((id) => id === name) ?? null;
}

export function formatHash(id: PageId): string {
  return `#${id}`;
}

function openedOnly(id: PageId): Record<PageId, boolean> {
  const out = {} as Record<PageId, boolean>;
  for (const p of PAGE_IDS) out[p] = p === id;
  return out;
}

export function initialState(hash: string): { state: PagingState; repairHash: boolean } {
  const parsed = parseHash(hash);
  const current: PageId = parsed ?? 'cover';
  return {
    state: { current, leaving: null, direction: null, held: null, opened: openedOnly(current) },
    repairHash: parsed === null,
  };
}

function accept(
  s: PagingState,
  to: PageId,
  source: Source,
  reduced: boolean,
): { state: PagingState; effects: PagingEffects } {
  const opened = { ...s.opened, [to]: true } as Record<PageId, boolean>;
  const hash = source === 'hash' ? null : 'push';
  const effects: PagingEffects = {
    hash,
    startTimer: !reduced,
    announce: to,
    scrollTop: true,
    focusHeading: false,
  };
  if (reduced) {
    return { state: { ...s, current: to, leaving: null, direction: null, held: null, opened }, effects };
  }
  const direction: Direction = PAGE_IDS.indexOf(to) > PAGE_IDS.indexOf(s.current) ? 'forward' : 'back';
  return { state: { ...s, current: to, leaving: s.current, direction, held: null, opened }, effects };
}

export function transition(
  s: PagingState,
  e: PagingEvent,
): { state: PagingState; effects: PagingEffects } {
  switch (e.type) {
    case 'request': {
      if (s.leaving !== null) {
        return { state: { ...s, held: { to: e.to, source: e.source } }, effects: NO_EFFECTS };
      }
      if (e.to === s.current) return { state: s, effects: NO_EFFECTS };
      return accept(s, e.to, e.source, e.reduced);
    }
    case 'effect-end': {
      const rest: PagingState = { ...s, leaving: null, direction: null, held: null };
      if (s.held === null) return { state: rest, effects: NO_EFFECTS };
      if (s.held.to === s.current) {
        // A hash-source request earlier in the effect may have left a different hash in
        // the address bar, and a later held request replaced it. Always repair.
        return { state: rest, effects: { ...NO_EFFECTS, hash: 'replace' } };
      }
      return accept(rest, s.held.to, s.held.source, e.reduced ?? false);
    }
    case 'bad-hash':
      // A stale held request would end with a hash that differs from the page.
      return { state: s.held === null ? s : { ...s, held: null }, effects: { ...NO_EFFECTS, hash: 'replace' } };
  }
}
