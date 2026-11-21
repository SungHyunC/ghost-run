// Pure input rules for the paged landing page (design Component 4).

import type { PageId } from '../data/pages';

export interface KeyLike {
  key: string;
  defaultPrevented: boolean;
  repeat: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: { tagName: string; isContentEditable: boolean; role: string | null } | null;
}

export interface TouchPoint {
  x: number;
  y: number;
}

export const SWIPE_MIN_PX = 60;

const IGNORED_TAGS: ReadonlySet<string> = new Set(['input', 'textarea', 'select']);
const IGNORED_ROLES: ReadonlySet<string> = new Set(['tab', 'slider', 'switch', 'textbox']);
const LINK_PAGES: Readonly<Record<string, PageId>> = {
  '#recipe': 'recipe',
  '#costumes': 'costumes',
  '#run': 'run',
  '#make': 'make',
};

export function keyToStep(key: string): -1 | 0 | 1 {
  if (key === 'ArrowRight' || key === 'PageDown') return 1;
  if (key === 'ArrowLeft' || key === 'PageUp') return -1;
  return 0;
}

export function ignoreKey(k: KeyLike): boolean {
  if (k.target === null) return true;
  if (k.defaultPrevented || k.repeat) return true;
  if (k.altKey || k.ctrlKey || k.metaKey || k.shiftKey) return true;
  if (IGNORED_TAGS.has(k.target.tagName.toLowerCase())) return true;
  if (k.target.isContentEditable) return true;
  return k.target.role !== null && IGNORED_ROLES.has(k.target.role.toLowerCase());
}

export function ignoreSwipeStart(target: {
  tagName: string;
  role: string | null;
  insideSlider: boolean;
}): boolean {
  if (target.insideSlider) return true;
  if (IGNORED_TAGS.has(target.tagName.toLowerCase())) return true;
  return target.role !== null && target.role.toLowerCase() === 'slider';
}

export function swipeStep(start: TouchPoint, end: TouchPoint): -1 | 0 | 1 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) <= SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

export function linkPage(href: string | null): PageId | null {
  if (href === null) return null;
  return Object.prototype.hasOwnProperty.call(LINK_PAGES, href) ? (LINK_PAGES[href] ?? null) : null;
}
