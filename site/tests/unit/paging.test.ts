import { describe, expect, it } from 'vitest';
import { PAGE_IDS, PAGES, type PageId } from '../../src/data/pages';
import {
  EFFECT_MS,
  formatHash,
  initialState,
  parseHash,
  transition,
  type PagingEvent,
  type PagingState,
} from '../../src/engine/paging';
import { fakeHistory, visibility } from '../lib/page-visibility';

function at(page: PageId): PagingState {
  return initialState(`#${page}`).state;
}
function req(to: PageId, reduced = false, source: 'bar' | 'key' | 'hash' | 'link' = 'bar'): PagingEvent {
  return { type: 'request', to, source, reduced };
}

describe('registry', () => {
  it('lists five pages in order', () => {
    expect(PAGE_IDS).toEqual(['cover', 'recipe', 'costumes', 'run', 'make']);
    expect(PAGES.map((p) => p.label)).toEqual(['Cover', 'Skeleton', 'Costumes', 'Ghost at work', 'Your own']);
    expect(EFFECT_MS).toBe(780);
  });
});

describe('transition table', () => {
  it('ignores a request for the current page', () => {
    const s = at('recipe');
    const r = transition(s, req('recipe'));
    expect(r.state).toBe(s);
    expect(r.effects).toEqual({ hash: null, startTimer: false, announce: null, scrollTop: false, focusHeading: false });
  });

  it('holds the last request during an effect', () => {
    const s1 = transition(at('cover'), req('recipe')).state;
    const s2 = transition(s1, req('run', false, 'key')).state;
    const r = transition(s2, req('make', false, 'link'));
    expect(r.state.held).toEqual({ to: 'make', source: 'link' });
    expect(r.state.current).toBe('recipe');
    expect(r.state.leaving).toBe('cover');
    expect(r.effects.announce).toBeNull();
  });

  it('switches at once under reduced motion', () => {
    const r = transition(at('cover'), req('costumes', true));
    expect(r.state.current).toBe('costumes');
    expect(r.state.leaving).toBeNull();
    expect(r.state.direction).toBeNull();
    expect(r.state.opened.costumes).toBe(true);
    expect(r.effects).toMatchObject({ hash: 'push', startTimer: false, announce: 'costumes', scrollTop: true });
  });

  it('starts a motion Turn forward and back', () => {
    const f = transition(at('recipe'), req('run'));
    expect(f.state).toMatchObject({ current: 'run', leaving: 'recipe', direction: 'forward' });
    expect(f.effects).toMatchObject({ hash: 'push', startTimer: true, announce: 'run', scrollTop: true });
    const b = transition(at('run'), req('recipe'));
    expect(b.state).toMatchObject({ current: 'recipe', leaving: 'run', direction: 'back' });
  });

  it('writes no hash for a hash-source request', () => {
    expect(transition(at('cover'), req('make', false, 'hash')).effects.hash).toBeNull();
    expect(transition(at('cover'), req('make', true, 'hash')).effects.hash).toBeNull();
  });

  it('effect-end clears the effect and runs a held request with its own source', () => {
    let s = transition(at('cover'), req('recipe')).state;
    s = transition(s, req('run', false, 'key')).state;
    const r = transition(s, { type: 'effect-end' });
    expect(r.state).toMatchObject({ current: 'run', leaving: 'recipe', direction: 'forward', held: null });
    expect(r.effects).toMatchObject({ hash: 'push', startTimer: true, announce: 'run' });
    const end = transition(r.state, { type: 'effect-end' });
    expect(end.state).toMatchObject({ leaving: null, direction: null, held: null });
    expect(end.effects.startTimer).toBe(false);
  });

  it('the last of two held requests wins', () => {
    let s = transition(at('cover'), req('recipe')).state;
    s = transition(s, req('run')).state;
    s = transition(s, req('make')).state;
    expect(transition(s, { type: 'effect-end' }).state.current).toBe('make');
  });

  it('a held request for the then-current page changes no page and repairs the hash', () => {
    let s = transition(at('cover'), req('recipe')).state;
    s = transition(s, req('recipe')).state;
    expect(s.held).toEqual({ to: 'recipe', source: 'bar' });
    const r = transition(s, { type: 'effect-end' });
    expect(r.state.current).toBe('recipe');
    expect(r.state.leaving).toBeNull();
    expect(r.effects.hash).toBe('replace');
    expect(r.effects.announce).toBeNull();
  });

  it('a held bar request for the current page after a held hash request still repairs the hash', () => {
    let s = transition(at('cover'), req('make', false, 'hash')).state;
    s = transition(s, req('cover', false, 'hash')).state;
    s = transition(s, req('make')).state;
    const r = transition(s, { type: 'effect-end' });
    expect(r.state).toMatchObject({ current: 'make', leaving: null, held: null });
    expect(r.effects).toMatchObject({ hash: 'replace', startTimer: false, announce: null });
  });

  it('a held hash-source request for the current page writes a replace at effect-end', () => {
    let s = transition(at('cover'), req('recipe')).state;
    s = transition(s, req('recipe', false, 'hash')).state;
    const r = transition(s, { type: 'effect-end' });
    expect(r.state).toMatchObject({ current: 'recipe', leaving: null, held: null });
    expect(r.effects).toMatchObject({ hash: 'replace', startTimer: false, announce: null });
  });

  it('bad-hash during an effect clears the held request', () => {
    let s = transition(at('cover'), req('recipe')).state;
    s = transition(s, req('run', false, 'link')).state;
    const bad = transition(s, { type: 'bad-hash' });
    expect(bad.state).toMatchObject({ current: 'recipe', leaving: 'cover', held: null });
    expect(bad.effects.hash).toBe('replace');
    expect(transition(bad.state, { type: 'effect-end' }).state.current).toBe('recipe');
  });

  it('bad-hash requests a replace write and changes no page', () => {
    const s = at('run');
    const r = transition(s, { type: 'bad-hash' });
    expect(r.state).toBe(s);
    expect(r.effects.hash).toBe('replace');
  });

  it('opened is set at the first Turn and never reset', () => {
    let s = at('cover');
    expect(s.opened).toEqual({ cover: true, recipe: false, costumes: false, run: false, make: false });
    s = transition(s, req('run', true)).state;
    s = transition(s, req('cover', true)).state;
    expect(s.opened).toEqual({ cover: true, recipe: false, costumes: false, run: true, make: false });
  });
});

describe('initialState', () => {
  it.each(PAGE_IDS)('opens %s from its hash', (id) => {
    const { state, repairHash } = initialState(`#${id}`);
    expect(state.current).toBe(id);
    expect(state.leaving).toBeNull();
    expect(state.opened[id]).toBe(true);
    expect(repairHash).toBe(false);
  });

  it.each(['', '#', '#unknown', '#Recipe'])('opens the cover and repairs %j', (hash) => {
    const { state, repairHash } = initialState(hash);
    expect(state.current).toBe('cover');
    expect(repairHash).toBe(true);
  });
});

describe('hash codec', () => {
  it.each(PAGE_IDS)('round-trips %s', (id) => {
    expect(formatHash(id)).toBe(`#${id}`);
    expect(parseHash(formatHash(id))).toBe(id);
  });

  it.each(['#', '#Recipe', '#recipe/', '#unknown', '', 'recipe'])('parseHash(%j) is null', (h) => {
    expect(parseHash(h)).toBeNull();
  });
});

describe('test helpers', () => {
  it('records history calls', () => {
    const h = fakeHistory('#cover');
    h.pushState(null, '', '#run');
    h.replaceState(null, '', '#make');
    expect(h.calls.map((c) => c.kind)).toEqual(['push', 'replace']);
    expect(h.hash()).toBe('#make');
    expect(visibility('run', ['cover']).opened).toMatchObject({ run: true, cover: true, make: false });
  });
});
