import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../../index.html'), 'utf8');

describe('index.html', () => {
  it('declares English and the exact title', () => {
    expect(html).toMatch(/<html[^>]*\slang="en"/);
    expect(html).toContain("<title>Ghost Run+: let your agent's ghost try it first</title>");
  });

  it('has at most the one CSP meta (injected at build) and never frame-ancestors', () => {
    const metas = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi) ?? [];
    expect(metas.length).toBeLessThanOrEqual(1);
    expect(html).not.toContain('frame-ancestors');
  });

  it('has no inline script and no style attribute', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const m of scripts) {
      expect(m[1]).toMatch(/\ssrc="/);
      expect((m[2] ?? '').trim()).toBe('');
    }
    expect(html).not.toMatch(/<[a-z][^>]*\sstyle\s*=/i);
  });
});
