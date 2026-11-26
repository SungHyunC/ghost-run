// Feature: site-pages, Property Pg6: No 'unsafe-eval' anywhere (policy part)
// **Validates: Requirements 16.6, 17.1, 17.2, 17.3, 17.5, 17.6, 17.7**
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { NUM_RUNS } from '../pbt-config';

type Block = { path: string; headers: string[] };
type Finding = { file: string; reference: string; rule: string };

const headersPath = '../../scripts/lib/headers.mjs';
const cspPath = '../../scripts/lib/csp.mjs';
const checkPath = '../../scripts/check-site.mjs';
const { parseHeaders, printHeaders, buildRootHeaders, scopeBlocks } = (await import(/* @vite-ignore */ headersPath)) as {
  parseHeaders: (text: string) => Block[];
  printHeaders: (blocks: Block[]) => string;
  buildRootHeaders: (text: string) => string;
  scopeBlocks: (blocks: Block[], prefix: string) => Block[];
};
const { landingHeaderPolicy, landingMetaPolicy } = (await import(/* @vite-ignore */ cspPath)) as {
  landingHeaderPolicy: () => string;
  landingMetaPolicy: () => string;
};
const { checkSite, RULE_POLICY } = (await import(/* @vite-ignore */ checkPath)) as {
  checkSite: (distRoot: string) => Finding[];
  RULE_POLICY: string;
};

const KIT_SCOPES = ['/', '/index.html', '/kit/', '/kit/index.html'] as const;
const FORBIDDEN = ["'unsafe-eval'", "'unsafe-inline'", 'http:', 'https:', '*'] as const;

const segment = fc.stringMatching(/^[a-z0-9._-]{1,8}$/);
const pathArb = fc.oneof(
  fc.constant('/*'),
  fc.constant('/'),
  fc
    .tuple(fc.array(segment, { minLength: 1, maxLength: 3 }), fc.boolean())
    .map(([segs, star]) => `/${segs.join('/')}${star ? '/*' : ''}`),
);
const headerArb = fc
  .tuple(
    fc.stringMatching(/^[A-Za-z][A-Za-z0-9-]{0,15}$/),
    fc.stringMatching(/^[A-Za-z0-9'; ,:=*._/-]{1,40}$/),
  )
  .map(([name, value]) => `${name}: ${value.trim() || 'x'}`);
const blocksArb = fc.uniqueArray(
  fc.record({ path: pathArb, headers: fc.array(headerArb, { minLength: 0, maxLength: 4 }) }),
  { minLength: 1, maxLength: 5, selector: (b) => b.path },
);

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Findings of the existing policy rule for a `_headers` text (the Site_Check rule of task 8.3 extends it). */
function policyFindings(headersText: string): Finding[] {
  const root = mkdtempSync(path.join(tmpdir(), 'csp-kit-'));
  roots.push(root);
  mkdirSync(path.join(root, 'kit'), { recursive: true });
  writeFileSync(path.join(root, 'index.html'), '<p></p>');
  writeFileSync(path.join(root, 'kit', 'index.html'), '<p></p>');
  writeFileSync(path.join(root, '_headers'), headersText);
  const found = checkSite(root).filter((f) => f.rule === RULE_POLICY);
  rmSync(root, { recursive: true, force: true });
  return found;
}

describe('Property Pg6: the /kit/ policy blocks', () => {
  it('gives the four landing scopes the Landing_Policy block, apart from the path, with no forbidden token', () => {
    fc.assert(
      fc.property(blocksArb, (blocks) => {
        const root = parseHeaders(buildRootHeaders(printHeaders(blocks)));
        const base = root.find((b) => b.path === '/');
        for (const scope of KIT_SCOPES) {
          const matching = root.filter((b) => b.path === scope);
          expect(matching).toHaveLength(1);
          expect(matching[0]?.headers).toEqual(base?.headers);
          const policy = matching[0]?.headers.find((h) => h.startsWith('Content-Security-Policy:')) ?? '';
          expect(policy).toContain(landingHeaderPolicy());
          for (const bad of FORBIDDEN) expect(policy, `${scope} ${bad}`).not.toContain(bad);
        }
        for (const bad of FORBIDDEN) expect(landingMetaPolicy()).not.toContain(bad);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('leaves the /kit/ blocks unchanged when the shell blocks are scoped under /shell', () => {
    fc.assert(
      fc.property(blocksArb, (blocks) => {
        const root = parseHeaders(buildRootHeaders(printHeaders(blocks)));
        const shell = scopeBlocks(blocks, '/shell');
        const rest = root.filter((b) => !shell.some((s) => s.path === b.path));
        expect(rest.map((b) => b.path)).toEqual([...KIT_SCOPES, '/hand/*']);
        for (const block of root.filter((b) => b.path.startsWith('/kit/'))) {
          expect(block.headers).toEqual(root[0]?.headers);
        }
        expect(root.map((b) => b.path)).not.toContain('/kit/*');
        expect(root.map((b) => b.path)).not.toContain('/kit/gallery/*');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('accepts the built file and rejects a /kit/ block with any of the five tokens added', () => {
    fc.assert(
      fc.property(
        blocksArb,
        fc.constantFrom(...FORBIDDEN),
        fc.constantFrom('/kit/', '/kit/index.html'),
        (blocks, token, scope) => {
          const text = buildRootHeaders(printHeaders(blocks));
          const good = policyFindings(text).filter((f) => KIT_SCOPES.some((s) => f.reference.startsWith(`${s}  `)));
          expect(good).toEqual([]);

          const mutated = parseHeaders(text).map((b) =>
            b.path === scope
              ? { ...b, headers: b.headers.map((h) => (h.startsWith('Content-Security-Policy:') ? `${h}; script-src ${token}` : h)) }
              : b,
          );
          const bad = policyFindings(printHeaders(mutated)).filter((f) => f.reference.startsWith(`${scope}  `));
          expect(bad.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
