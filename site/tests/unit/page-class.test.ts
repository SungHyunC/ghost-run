import { describe, expect, it } from 'vitest';
import { pageClass } from '../../src/components/Book';
import { PAGE_IDS } from '../../src/data/pages';
import { initialState, transition } from '../../src/engine/paging';

function turning(from: 'recipe' | 'costumes', to: 'recipe' | 'costumes' | 'run') {
  const start = initialState(`#${from}`).state;
  return transition(start, { type: 'request', to, source: 'bar', reduced: false }).state;
}

describe('pageClass', () => {
  it('names direction and role for a forward turn', () => {
    const s = turning('recipe', 'costumes');
    expect(pageClass(s, 'costumes')).toBe('page on enter-next');
    expect(pageClass(s, 'recipe')).toBe('page leave-next');
    for (const id of PAGE_IDS.filter((p) => p !== 'costumes' && p !== 'recipe')) expect(pageClass(s, id)).toBe('page');
  });

  it('names direction and role for a back turn', () => {
    const s = turning('costumes', 'recipe');
    expect(pageClass(s, 'recipe')).toBe('page on enter-back');
    expect(pageClass(s, 'costumes')).toBe('page leave-back');
    for (const id of PAGE_IDS.filter((p) => p !== 'costumes' && p !== 'recipe')) expect(pageClass(s, id)).toBe('page');
  });

  it('leaves no turn class at rest', () => {
    const s = initialState('#run').state;
    for (const id of PAGE_IDS) expect(pageClass(s, id)).toBe(id === 'run' ? 'page on' : 'page');
  });

  it('uses the four turn classes and no others', () => {
    const classes = new Set<string>();
    for (const [from, to] of [['recipe', 'costumes'], ['costumes', 'recipe']] as const) {
      const s = turning(from, to);
      for (const id of PAGE_IDS) pageClass(s, id).split(' ').forEach((c) => classes.add(c));
    }
    expect([...classes].sort()).toEqual(['enter-back', 'enter-next', 'leave-back', 'leave-next', 'on', 'page']);
  });
});
