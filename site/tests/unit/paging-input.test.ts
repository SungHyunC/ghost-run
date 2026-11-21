import { describe, expect, it } from 'vitest';
import {
  SWIPE_MIN_PX,
  ignoreKey,
  ignoreSwipeStart,
  keyToStep,
  linkPage,
  swipeStep,
  type KeyLike,
} from '../../src/engine/paging-input';

const key = (over: Partial<KeyLike> = {}): KeyLike => ({
  key: 'ArrowRight',
  defaultPrevented: false,
  repeat: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  target: { tagName: 'BODY', isContentEditable: false, role: null },
  ...over,
});
const tgt = (tagName: string, role: string | null = null, isContentEditable = false) => ({
  tagName,
  role,
  isContentEditable,
});

describe('keyToStep', () => {
  it('maps each key', () => {
    expect(keyToStep('ArrowRight')).toBe(1);
    expect(keyToStep('PageDown')).toBe(1);
    expect(keyToStep('ArrowLeft')).toBe(-1);
    expect(keyToStep('PageUp')).toBe(-1);
    expect(keyToStep('a')).toBe(0);
    expect(keyToStep('ArrowUp')).toBe(0);
  });
});

describe('ignoreKey', () => {
  it('passes a plain key on the body', () => {
    expect(ignoreKey(key())).toBe(false);
  });
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('ignores %s', (tag) => {
    expect(ignoreKey(key({ target: tgt(tag) }))).toBe(true);
  });
  it('ignores content-editable', () => {
    expect(ignoreKey(key({ target: tgt('DIV', null, true) }))).toBe(true);
  });
  it.each(['tab', 'slider', 'switch', 'textbox'])('ignores role %s', (role) => {
    expect(ignoreKey(key({ target: tgt('DIV', role) }))).toBe(true);
  });
  it('does not ignore other roles', () => {
    expect(ignoreKey(key({ target: tgt('DIV', 'button') }))).toBe(false);
  });
  it('ignores a null target, defaultPrevented, and repeat', () => {
    expect(ignoreKey(key({ target: null }))).toBe(true);
    expect(ignoreKey(key({ defaultPrevented: true }))).toBe(true);
    expect(ignoreKey(key({ repeat: true }))).toBe(true);
  });
  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)('ignores %s', (m) => {
    expect(ignoreKey(key({ [m]: true }))).toBe(true);
  });
});

describe('swipeStep', () => {
  const at = (dx: number, dy = 0) => swipeStep({ x: 200, y: 200 }, { x: 200 + dx, y: 200 + dy });
  it('does not turn at exactly 60 px', () => {
    expect(SWIPE_MIN_PX).toBe(60);
    expect(at(-60)).toBe(0);
    expect(at(60)).toBe(0);
  });
  it('turns at 61 px', () => {
    expect(at(-61)).toBe(1);
    expect(at(61)).toBe(-1);
  });
  it('does not turn on a diagonal move', () => {
    expect(at(-80, 80)).toBe(0);
    expect(at(-80, 90)).toBe(0);
    expect(at(-80, 20)).toBe(1);
  });
});

describe('ignoreSwipeStart', () => {
  it('ignores input, textarea, select, slider role, and inside a slider', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(ignoreSwipeStart({ tagName, role: null, insideSlider: false })).toBe(true);
    }
    expect(ignoreSwipeStart({ tagName: 'DIV', role: 'slider', insideSlider: false })).toBe(true);
    expect(ignoreSwipeStart({ tagName: 'SPAN', role: null, insideSlider: true })).toBe(true);
  });
  it('allows a swipe that starts on plain content', () => {
    expect(ignoreSwipeStart({ tagName: 'DIV', role: null, insideSlider: false })).toBe(false);
  });
});

describe('linkPage', () => {
  it('maps the four page hashes', () => {
    expect(linkPage('#run')).toBe('run');
    expect(linkPage('#recipe')).toBe('recipe');
    expect(linkPage('#costumes')).toBe('costumes');
    expect(linkPage('#make')).toBe('make');
  });
  it('gives null for non-page hrefs', () => {
    expect(linkPage('shell/')).toBeNull();
    expect(linkPage('#cover')).toBeNull();
    expect(linkPage('#p-mirror')).toBeNull();
    expect(linkPage(null)).toBeNull();
    expect(linkPage('#constructor')).toBeNull();
  });
});
