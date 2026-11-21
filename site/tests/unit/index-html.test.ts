import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const pages = [
  { name: 'index.html', html: readFileSync(resolve(here, '../../index.html'), 'utf8'), entry: '/src/main.tsx' },
  { name: 'kit/index.html', html: readFileSync(resolve(here, '../../kit/index.html'), 'utf8'), entry: '/src/showcase/main.tsx' },
];

describe.each(pages)('$name', ({ html, entry }) => {
  it('declares English and a title', () => {
    expect(html).toMatch(/<html[^>]*\slang="en"/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });

  it('has at most the one CSP meta (injected at build) and never frame-ancestors', () => {
    const metas = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi) ?? [];
    expect(metas.length).toBeLessThanOrEqual(1);
    expect(html).not.toContain('frame-ancestors');
  });

  it('has no inline script and no style attribute, and one module script', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const m of scripts) {
      expect(m[1]).toMatch(/\ssrc="/);
      expect((m[2] ?? '').trim()).toBe('');
    }
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.[1]).toContain(`src="${entry}"`);
    expect(html).not.toMatch(/<[a-z][^>]*\sstyle\s*=/i);
    expect(html).not.toMatch(/<style\b/i);
  });
});

describe('index.html title', () => {
  it('is the exact landing title', () => {
    expect(pages[0]?.html).toContain("<title>Ghost Run+: let your agent's ghost try it first</title>");
  });
});

describe('kit/index.html shell', () => {
  const html = pages[1]?.html ?? '';
  it('links the icon one folder up and has the root element', () => {
    expect(html).toContain('href="../favicon.svg"');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('name="viewport"');
  });
});
