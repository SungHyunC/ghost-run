import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

type Block = { path: string; headers: string[] };
type HeadersModule = {
  parseHeaders: (text: string) => Block[];
  printHeaders: (blocks: Block[]) => string;
  scopeBlocks: (blocks: Block[], prefix: string) => Block[];
  buildRootHeaders: (shellHeadersText: string) => string;
};

const modulePath = '../../scripts/lib/headers.mjs';
const { parseHeaders, printHeaders, scopeBlocks, buildRootHeaders } = (await import(
  /* @vite-ignore */ modulePath
)) as HeadersModule;

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
const blockArb: fc.Arbitrary<Block> = fc.record({
  path: pathArb,
  headers: fc.array(headerArb, { minLength: 0, maxLength: 4 }),
});
const blocksArb = fc.uniqueArray(blockArb, {
  minLength: 1,
  maxLength: 5,
  selector: (b) => b.path,
});

describe('Property 11: Headers rewrite', () => {
  /** **Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5** */
  it('scopes every path under /shell, keeps headers, and round-trips through print and parse', () => {
    fc.assert(
      fc.property(blocksArb, (blocks) => {
        const text = printHeaders(blocks);
        const parsed = parseHeaders(text);
        expect(parsed).toEqual(blocks);

        const scoped = scopeBlocks(parsed, '/shell');
        expect(scoped).toHaveLength(blocks.length);
        scoped.forEach((block, i) => {
          expect(block.path === '/shell' || block.path.startsWith('/shell/')).toBe(true);
          expect(block.path).not.toBe('/*');
          expect(block.headers).toEqual(blocks[i]?.headers);
        });
        expect(parseHeaders(printHeaders(scoped))).toEqual(scoped);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5** */
  it('builds a root file with one block per scope, no /* block, and a strict / policy', () => {
    fc.assert(
      fc.property(blocksArb, (blocks) => {
        const root = parseHeaders(buildRootHeaders(printHeaders(blocks)));
        const paths = root.map((b) => b.path);
        expect(paths).not.toContain('/*');
        expect(paths.slice(4, 5)).toEqual(['/hand/*']);
        expect(paths).not.toContain('/hand/');
        expect(paths).not.toContain('/kit/*');
        expect(paths).not.toContain('/kit/gallery/*');
        expect(new Set(paths).size).toBe(paths.length);
        expect(paths.slice(0, 4)).toEqual(['/', '/index.html', '/kit/', '/kit/index.html']);
        const slashHeaders = root.find((b) => b.path === '/')?.headers;
        for (const scope of ['/index.html', '/kit/', '/kit/index.html']) {
          expect(root.find((b) => b.path === scope)?.headers).toEqual(slashHeaders);
        }

        const slash = root.find((b) => b.path === '/');
        const policy = slash?.headers.find((h) => h.startsWith('Content-Security-Policy:')) ?? '';
        expect(policy).not.toBe('');
        for (const bad of ['http:', 'https:', '*', 'data:', 'unsafe-inline']) {
          expect(policy).not.toContain(bad);
        }
        expect(policy).not.toMatch(/'unsafe-eval'/);
        const hand = root.find((b) => b.path === '/hand/*')?.headers;
        const handPolicy = hand?.find((h) => h.startsWith('Content-Security-Policy:')) ?? '';
        expect(handPolicy.replace(" 'unsafe-eval'", '')).toBe(policy);
        expect(hand?.slice(1)).toEqual(slashHeaders?.slice(1));
        expect(policy).toContain("frame-ancestors 'none'");
      }),
      { numRuns: 100 },
    );
  });
});
