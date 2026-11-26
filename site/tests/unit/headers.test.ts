import { describe, expect, it } from 'vitest';

type Block = { path: string; headers: string[] };
type HeadersModule = {
  parseHeaders: (text: string) => Block[];
  printHeaders: (blocks: Block[]) => string;
  scopeBlocks: (blocks: Block[], prefix: string) => Block[];
  buildRootHeaders: (shellHeadersText: string) => string;
};

// Loaded by variable path so that the plain .mjs script needs no type declaration file.
const modulePath = '../../scripts/lib/headers.mjs';
const { parseHeaders, printHeaders, scopeBlocks, buildRootHeaders } = (await import(
  /* @vite-ignore */ modulePath
)) as HeadersModule;

const SHELL_CSP =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const SHELL_FILE = `/*
  Content-Security-Policy: ${SHELL_CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
`;

const ROOT_CSP =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const HAND_CSP =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const EXPECTED_ROOT = `/
  Content-Security-Policy: ${ROOT_CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/index.html
  Content-Security-Policy: ${ROOT_CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/kit/
  Content-Security-Policy: ${ROOT_CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/kit/index.html
  Content-Security-Policy: ${ROOT_CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/hand/*
  Content-Security-Policy: ${HAND_CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/shell/*
  Content-Security-Policy: ${SHELL_CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
`;

describe('headers library', () => {
  it('parses the shell _headers shape into one block', () => {
    const blocks = parseHeaders(SHELL_FILE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.path).toBe('/*');
    expect(blocks[0]?.headers).toEqual([
      `Content-Security-Policy: ${SHELL_CSP}`,
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
    ]);
  });

  it('ignores comments and blank lines, and prints the parsed file back', () => {
    const text = `# note\n\n${SHELL_FILE}`;
    expect(printHeaders(parseHeaders(text))).toBe(SHELL_FILE);
  });

  it('scopes only the path line', () => {
    const blocks = parseHeaders(`${SHELL_FILE}/ko.html\n  X-Test: 1\n`);
    const scoped = scopeBlocks(blocks, '/shell');
    expect(scoped.map((b) => b.path)).toEqual(['/shell/*', '/shell/ko.html']);
    expect(scoped.map((b) => b.headers)).toEqual(blocks.map((b) => b.headers));
  });

  it('builds the exact root file', () => {
    expect(buildRootHeaders(SHELL_FILE)).toBe(EXPECTED_ROOT);
  });

  it('has the /kit/ blocks equal to the / block apart from the path; no /*, /kit/*, or /kit/gallery/*', () => {
    const blocks = parseHeaders(buildRootHeaders(SHELL_FILE));
    expect(blocks.map((b) => b.path)).toEqual(['/', '/index.html', '/kit/', '/kit/index.html', '/hand/*', '/shell/*']);
    const root = blocks.find((b) => b.path === '/');
    for (const scope of ['/index.html', '/kit/', '/kit/index.html']) {
      expect(blocks.find((b) => b.path === scope)?.headers).toEqual(root?.headers);
    }
  });

  it("gives /hand/* the landing policy plus 'unsafe-eval', no other origin, and has no /hand/ block", () => {
    const blocks = parseHeaders(buildRootHeaders(SHELL_FILE));
    expect(blocks.some((b) => b.path === '/hand/')).toBe(false);
    const hand = blocks.find((b) => b.path === '/hand/*');
    expect(hand?.headers).toEqual([`Content-Security-Policy: ${HAND_CSP}`, 'X-Content-Type-Options: nosniff', 'Referrer-Policy: no-referrer']);
    expect(HAND_CSP.replace(" 'unsafe-eval'", '')).toBe(ROOT_CSP);
    expect(HAND_CSP).not.toMatch(/unsafe-inline|https?:|data:|blob:|\*/);
  });

  it('refuses an input without blocks', () => {
    expect(() => buildRootHeaders('')).toThrow();
    expect(() => buildRootHeaders('# only a comment\n')).toThrow();
    expect(() => scopeBlocks([], '/shell')).toThrow();
  });
});

/** Cloudflare Pages matching: a `*` splat matches any characters, none included; other characters match literally. */
function matches(pattern: string, requestPath: string): boolean {
  const escape = (part: string) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${pattern.split('*').map(escape).join('.*')}$`).test(requestPath);
}

describe('root _headers: one policy per path', () => {
  // Request paths of the built site: pages, folder URLs, and files under each app.
  const POLICY_PATHS = [
    '/', '/index.html',
    '/kit/', '/kit/index.html', '/kit/gallery/', '/kit/gallery/index.html', '/kit/assets/x.js',
    '/hand/', '/hand/index.html', '/hand/assets/mujoco.wasm', '/hand/assets/sim-worker.js',
    '/shell/', '/shell/index.html', '/shell/ko.html', '/shell/assets/x.js',
  ];

  it('matches a splat against none, some, and literal characters', () => {
    expect(matches('/hand/*', '/hand/')).toBe(true);
    expect(matches('/hand/*', '/hand/a/b.js')).toBe(true);
    expect(matches('/hand/*', '/hand')).toBe(false);
    expect(matches('/', '/index.html')).toBe(false);
    expect(matches('/kit/', '/kit/index.html')).toBe(false);
    expect(matches('/index.html', '/indexXhtml')).toBe(false);
  });

  it('gives no path two blocks that both set Content-Security-Policy', () => {
    const blocks = parseHeaders(buildRootHeaders(SHELL_FILE));
    for (const p of POLICY_PATHS) {
      const hits = blocks.filter((b) => matches(b.path, p) && b.headers.some((h) => /^content-security-policy\s*:/i.test(h)));
      expect(hits.length, `${p}: ${hits.map((b) => b.path).join(' ')}`).toBeLessThanOrEqual(1);
      // The page URLs and everything under /hand/ and /shell/ carry a header policy; /kit/ deeper files use the meta tag.
      if (!p.startsWith('/kit/gallery/') && !p.startsWith('/kit/assets/')) expect(hits, p).toHaveLength(1);
    }
  });
});
