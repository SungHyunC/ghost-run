// Feature: site-live, Property L11: Policy of the landing page
// **Validates: Requirements 14.1, 14.2, 14.3, 14.4**
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
const { parseHeaders, printHeaders, buildRootHeaders } = (await import(/* @vite-ignore */ headersPath)) as {
  parseHeaders: (text: string) => Block[];
  printHeaders: (blocks: Block[]) => string;
  buildRootHeaders: (text: string) => string;
};
const { landingHeaderPolicy } = (await import(/* @vite-ignore */ cspPath)) as {
  landingHeaderPolicy: () => string;
};
const { checkSite, RULE_POLICY } = (await import(/* @vite-ignore */ checkPath)) as {
  checkSite: (distRoot: string) => Finding[];
  RULE_POLICY: string;
};

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

/** Findings of the policy rule for a `_headers` file holding one `/` block with this policy. */
function policyFindings(policy: string): Finding[] {
  const root = mkdtempSync(path.join(tmpdir(), 'csp-prop-'));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'index.html'), '<p></p>');
  writeFileSync(path.join(root, '_headers'), printHeaders([{ path: '/', headers: [`Content-Security-Policy: ${policy}`] }]));
  const found = checkSite(root).filter((f) => f.rule === RULE_POLICY);
  rmSync(root, { recursive: true, force: true });
  return found;
}

// Additions the rule must reject. Each one either adds a forbidden token or widens connect-src with one.
const forbiddenAddition = fc.oneof(
  fc.constantFrom("script-src https:", "img-src *", "script-src 'unsafe-eval'", "style-src 'unsafe-inline'"),
  fc.constantFrom("connect-src 'self' https://host.example", 'connect-src *', "connect-src 'self' http://192.0.2.1"),
  fc.stringMatching(/^[a-z]{1,8}$/).map((name) => `connect-src 'self' https://${name}.test`),
);

describe('Property L11: Policy of the landing page', () => {
  it('gives the blocks /, /index.html, /kit/, and /kit/index.html the landing policy and never a /* scope', () => {
    fc.assert(
      fc.property(blocksArb, (blocks) => {
        const root = parseHeaders(buildRootHeaders(printHeaders(blocks)));
        const expected = `Content-Security-Policy: ${landingHeaderPolicy()}`;
        for (const scope of ['/', '/index.html', '/kit/', '/kit/index.html']) {
          const matching = root.filter((b) => b.path === scope);
          expect(matching).toHaveLength(1);
          expect(matching[0]?.headers).toContain(expected);
        }
        expect(root.map((b) => b.path)).not.toContain('/*');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('accepts the landing policy in the Site_Check policy rule', () => {
    expect(policyFindings(landingHeaderPolicy())).toEqual([]);
  });

  it('rejects the landing policy with a forbidden token or a widened connect-src added', () => {
    fc.assert(
      fc.property(forbiddenAddition, (addition) => {
        expect(policyFindings(`${landingHeaderPolicy()}; ${addition}`).length).toBeGreaterThan(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
