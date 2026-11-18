// Helpers for static-markup tests. Name listing is regex based so it works in the node projects.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** Render a pure view to static markup. */
export function renderMarkup(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

/** Parse markup into a `template` element. Needs a DOM (dom project). */
export function parseToTemplate(markup: string): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template;
}

/** Lower-case element names in document order, without duplicates removed. */
export function listElementNames(markup: string): string[] {
  return [...markup.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)/g)].map((m) => (m[1] ?? '').toLowerCase());
}

/** Lower-case attribute names of all elements, sorted and unique. */
export function listAttributeNames(markup: string): string[] {
  const names = new Set<string>();
  for (const tag of markup.matchAll(/<[a-zA-Z][a-zA-Z0-9-]*((?:\s+[^\s"'<>/=]+(?:="[^"]*")?)*)\s*\/?>/g)) {
    for (const a of (tag[1] ?? '').matchAll(/\s+([^\s"'<>/=]+)/g)) {
      // Skip tokens that are inside quoted values: the pattern above only matches bare names.
      names.add((a[1] ?? '').toLowerCase());
    }
  }
  return [...names].sort();
}

/** Escape text the way React escapes text children and attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
