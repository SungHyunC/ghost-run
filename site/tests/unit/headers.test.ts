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

  it('has the /kit/ blocks equal to the / block apart from the path; no /*, /hand/*, /kit/*, or /kit/gallery/*', () => {
    const blocks = parseHeaders(buildRootHeaders(SHELL_FILE));
    expect(blocks.map((b) => b.path)).toEqual(['/', '/index.html', '/kit/', '/kit/index.html', '/shell/*']);
    const root = blocks.find((b) => b.path === '/');
    for (const scope of ['/index.html', '/kit/', '/kit/index.html']) {
      expect(blocks.find((b) => b.path === scope)?.headers).toEqual(root?.headers);
    }
  });

  it('refuses an input without blocks', () => {
    expect(() => buildRootHeaders('')).toThrow();
    expect(() => buildRootHeaders('# only a comment\n')).toThrow();
    expect(() => scopeBlocks([], '/shell')).toThrow();
  });
});
