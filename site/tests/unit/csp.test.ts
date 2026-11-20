import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type CspModule = {
  LANDING_CSP_PARTS: readonly string[];
  landingHeaderPolicy: () => string;
  landingMetaPolicy: () => string;
};
type HeadersModule = { buildRootHeaders: (shellHeadersText: string) => string };

// Loaded by variable path so that the plain .mjs scripts need no type declaration file.
const cspPath = '../../scripts/lib/csp.mjs';
const headersPath = '../../scripts/lib/headers.mjs';
const { LANDING_CSP_PARTS, landingHeaderPolicy, landingMetaPolicy } = (await import(/* @vite-ignore */ cspPath)) as CspModule;
const { buildRootHeaders } = (await import(/* @vite-ignore */ headersPath)) as HeadersModule;

const here = dirname(fileURLToPath(import.meta.url));

// The policy of the `site` spec (Requirement 19, criterion 4).
const SITE_SPEC_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

describe('landing policy', () => {
  it('differs from the policy of the site spec by exactly the three changes', () => {
    const before = SITE_SPEC_POLICY.split('; ');
    const after = landingHeaderPolicy().split('; ');
    const removed = before.filter((d) => !after.includes(d)).sort();
    const added = after.filter((d) => !before.includes(d)).sort();
    expect(removed).toEqual(["connect-src 'none'", "script-src 'self'"]);
    expect(added).toEqual(["connect-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "worker-src 'self'"]);
    expect(after).toHaveLength(before.length + 1);
  });

  it('has the exact header policy of the design', () => {
    expect(landingHeaderPolicy()).toBe(
      "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  it('makes the meta policy the header policy without frame-ancestors', () => {
    expect(landingMetaPolicy()).toBe(landingHeaderPolicy().replace('; frame-ancestors \'none\'', ''));
    expect(landingMetaPolicy()).not.toContain('frame-ancestors');
    expect(LANDING_CSP_PARTS.filter((p) => p.startsWith('frame-ancestors'))).toHaveLength(1);
  });

  it("contains 'wasm-unsafe-eval' and no 'unsafe-eval'", () => {
    expect(landingHeaderPolicy()).toContain("'wasm-unsafe-eval'");
    expect(landingHeaderPolicy()).not.toMatch(/'unsafe-eval'/);
  });

  it('is what the root headers builder prints for / and /index.html', () => {
    const text = buildRootHeaders("/*\n  X-Test: 1\n");
    const line = `  Content-Security-Policy: ${landingHeaderPolicy()}`;
    expect(text.startsWith(`/\n${line}\n`)).toBe(true);
    expect(text).toContain(`/index.html\n${line}\n`);
  });

  it('is read by vite.config.ts from the shared module', () => {
    const config = readFileSync(resolve(here, '../../vite.config.ts'), 'utf8');
    expect(config).toMatch(/from '\.\/scripts\/lib\/csp\.mjs'/);
    expect(config).toContain('landingMetaPolicy()');
    expect(config).not.toMatch(/default-src/);
  });

  it('is the meta policy of the built index.html when a build exists', () => {
    let built: string;
    try {
      built = readFileSync(resolve(here, '../../build/dist/index.html'), 'utf8');
    } catch {
      return; // no build output yet; the vite.config.ts source check above still holds
    }
    const meta = /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/i.exec(built);
    expect(meta?.[1]?.replaceAll('&#39;', "'")).toBe(landingMetaPolicy());
  });
});
