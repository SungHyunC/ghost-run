import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

type Finding = { file: string; reference: string; rule: string };

// Loaded by variable path so that the plain .mjs script needs no type declaration file.
const modulePath = '../../scripts/check-site.mjs';
const { checkSite } = (await import(/* @vite-ignore */ modulePath)) as {
  checkSite: (distRoot: string, options?: { structure?: boolean }) => Finding[];
};

const roots: string[] = [];

function makeDist(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-site-'));
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const links = (root: string) => checkSite(root, { structure: false });

describe('checkSite local links', () => {
  it('reports nothing for a correct tree', () => {
    const root = makeDist({
      'index.html':
        '<link rel="icon" href="favicon.svg"><script src="/assets/app.js"></script><a href="shell/?x=1#top">s</a><a href="#make">m</a><section id="make"></section>',
      'favicon.svg': '<svg/>',
      'assets/app.js': 'const w=new URL("w.js",import.meta.url);import("./w.js");',
      'assets/w.js': 'export {}',
      'assets/s.css': '@font-face{src:url("f.woff2")}',
      'assets/f.woff2': 'x',
      'shell/index.html': '<a href="../">home</a>',
    });
    expect(links(root)).toEqual([]);
  });

  it('reports a broken link with file, reference, and rule', () => {
    const root = makeDist({ 'index.html': '<a href="nope.html">x</a>' });
    const findings = links(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: 'index.html', reference: 'nope.html' });
    expect(findings[0]?.rule).toMatch(/does not exist/);
  });

  it('reports a same-file fragment whose id is missing', () => {
    const root = makeDist({ 'index.html': '<a href="#there">x</a><a href="#here">y</a><p id="here"></p>' });
    const findings = links(root);
    expect(findings.map((f) => f.reference)).toEqual(['#there']);
  });

  it('resolves a trailing slash to index.html and flags a folder without one', () => {
    const root = makeDist({
      'index.html': '<a href="shell/">a</a><a href="empty/">b</a><a href="/hand/">c</a>',
      'shell/index.html': '',
      'hand/index.html': '',
      'empty/readme.txt': '',
    });
    expect(links(root).map((f) => f.reference)).toEqual(['empty/']);
  });

  it('flags a new URL worker reference to a missing file', () => {
    const root = makeDist({
      'assets/main.js': 'new Worker(new URL("sim-worker-ABC.js",import.meta.url));new URL("ok.wasm",import.meta.url);',
      'assets/ok.wasm': '',
    });
    expect(links(root).map((f) => f.reference)).toEqual(['sim-worker-ABC.js']);
  });

  it('resolves css urls relative to the css file and ignores query strings', () => {
    const root = makeDist({
      'assets/a.css': 'a{background:url(img/x.png?v=2)}b{background:url(../gone.png)}',
      'assets/img/x.png': '',
    });
    expect(links(root).map((f) => f.reference)).toEqual(['../gone.png']);
  });

  it('flags a reference that leaves the dist root', () => {
    const root = makeDist({ 'index.html': '<a href="../outside.html">x</a>' });
    expect(links(root)).toHaveLength(1);
  });
});

const REPO = 'https://github.com/SungHyunC/ghost-run';
const LANDING_POLICY =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const SHELL_POLICY =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const HEADERS = `/\n  Content-Security-Policy: ${LANDING_POLICY}\n/index.html\n  Content-Security-Policy: ${LANDING_POLICY}\n/shell/*\n  Content-Security-Policy: ${SHELL_POLICY}\n`;

function validSite(): Record<string, string> {
  return {
    'index.html': `<!doctype html><meta http-equiv="Content-Security-Policy" content="${LANDING_POLICY.replace(/; frame-ancestors 'none'/, '')}"><link rel="icon" href="favicon.svg"><link rel="stylesheet" href="assets/s.css"><script type="module" src="assets/app.js"></script><a href="${REPO}" rel="noopener noreferrer">GitHub</a><a href="shell/">s</a><footer><a href="./THIRD_PARTY_NOTICES.txt">Third-party notices</a></footer>`,
    'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'favicon.ico': 'ico',
    'assets/app.js': `const a="http://www.w3.org/2000/svg";const r="${REPO}";const e="https://react.dev/errors/";`,
    'assets/s.css': '@font-face{src:url("f.woff2")}',
    'assets/f.woff2': 'x',
    'shell/index.html': '',
    'shell/ko.html': '',
    'hand/index.html': '',
    'kit/index.html': '',
    'THIRD_PARTY_NOTICES.txt': 'notices',
    _headers: HEADERS,
  };
}

function rulesOf(files: Record<string, string>): string[] {
  return checkSite(makeDist(files)).map((f) => `${f.file} | ${f.rule.split(':')[0]}`);
}

describe('checkSite external URLs, headers scope, and structure', () => {
  it('reports nothing for a valid site', () => {
    expect(checkSite(makeDist(validSite()))).toEqual([]);
  });

  it('flags an external script URL in html and a css import', () => {
    const files = validSite();
    files['index.html'] += '<script src="https://cdn.example/x.js"></script>';
    files['assets/s.css'] += '@import "https://fonts.example/f.css";';
    const found = checkSite(makeDist(files)).map((f) => f.reference);
    expect(found).toEqual(expect.arrayContaining(['https://cdn.example/x.js', 'https://fonts.example/f.css']));
  });

  it('allows a namespace in a Landing_Page string but flags a non-allowlisted URL there', () => {
    const files = validSite();
    files['assets/app.js'] += 'const x="https://evil.example/p";';
    expect(checkSite(makeDist(files)).map((f) => f.reference)).toEqual(['https://evil.example/p']);
  });

  it('flags the repository URL in every forbidden place', () => {
    const cases: Array<[string, string]> = [
      ['index.html', `<img src="${REPO}">`],
      ['index.html', `<link rel="stylesheet" href="${REPO}">`],
      ['index.html', `<a href="${REPO}">no rel</a>`],
      ['index.html', `<a href="${REPO}" rel="noopener">half rel</a>`],
      ['index.html', `<form action="${REPO}"></form>`],
      ['assets/s.css', `a{background:url("${REPO}")}`],
    ];
    for (const [file, extra] of cases) {
      const files = validSite();
      files[file] += extra;
      const found = checkSite(makeDist(files));
      expect(found.some((f) => f.reference === REPO && /repository URL/.test(f.rule)), `${file}: ${extra}`).toBe(true);
    }
    const csp = validSite();
    csp['_headers'] = HEADERS.replace("connect-src 'self'", `connect-src ${REPO}`);
    expect(checkSite(makeDist(csp)).some((f) => /repository URL in a Content/.test(f.rule))).toBe(true);
    const meta = validSite();
    meta['index.html'] = meta['index.html']!.replace("connect-src 'self'", `connect-src ${REPO}`);
    expect(checkSite(makeDist(meta)).some((f) => f.file === 'index.html' && /repository URL in a Content/.test(f.rule))).toBe(true);
  });

  it('flags the repository URL as an anchor href outside index.html', () => {
    const files = validSite();
    files['shell/index.html'] = `<a href="${REPO}" rel="noopener noreferrer">x</a>`;
    expect(checkSite(makeDist(files)).map((f) => f.file)).toEqual(['shell/index.html']);
  });

  it('flags a /* scope, a scope with no folder, and a second _headers', () => {
    expect(rulesOf({ ...validSite(), _headers: `${HEADERS}/*\n  X-Content-Type-Options: nosniff\n` })).toContain('_headers | headers-scope');
    const missing = checkSite(makeDist({ ...validSite(), _headers: `${HEADERS}/nowhere/*\n  X-Content-Type-Options: nosniff\n` }));
    expect(missing.map((f) => f.reference)).toEqual(['/nowhere/*']);
    const second = checkSite(makeDist({ ...validSite(), 'shell/_headers': '/*\n  X: y\n' }));
    expect(second.map((f) => f.file)).toEqual(['shell/_headers']);
  });

  it('flags forbidden policy tokens, and allows data: and unsafe-inline only in the shell block', () => {
    const bad = checkSite(
      makeDist({ ...validSite(), _headers: HEADERS.replace("script-src 'self' 'wasm-unsafe-eval';", "script-src 'self' 'wasm-unsafe-eval' https://x.example 'unsafe-eval' * data: 'unsafe-inline';") }),
    );
    const tokens = bad.filter((f) => f.rule.startsWith('headers-policy')).map((f) => f.reference.split('  ')[1]);
    expect(tokens).toEqual(expect.arrayContaining(['https:', "'unsafe-eval'", '*', 'data:', "'unsafe-inline'"]));
  });

  it('flags a missing required path, a missing font, and a data: URL in Landing_Page css', () => {
    const files = validSite();
    delete files['shell/ko.html'];
    delete files['assets/f.woff2'];
    files['assets/s.css'] = 'a{background:url(data:image/png;base64,AAAA)}';
    const found = checkSite(makeDist(files));
    expect(found.map((f) => f.rule.split(':')[0])).toEqual(expect.arrayContaining(['structure', 'no-external-url']));
    expect(found.map((f) => f.reference)).toEqual(
      expect.arrayContaining(['(shell/ko.html)', '(*.woff2)', 'data:', 'data:image/png;base64,AAAA']),
    );
  });

  it('requires /favicon.ico', () => {
    const files = validSite();
    delete files['favicon.ico'];
    expect(checkSite(makeDist(files)).map((f) => f.reference)).toContain('(favicon.ico)');
  });

  it('flags an inline script and a style attribute in index.html', () => {
    const files = validSite();
    files['index.html'] += '<script>var a=1</script><div style="color:red"></div>';
    const rules = checkSite(makeDist(files)).map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining([expect.stringMatching(/inline <script>/), expect.stringMatching(/style attribute/)]));
  });

  it('flags a missing notice file and a missing notice link', () => {
    const noFile = validSite();
    delete noFile['THIRD_PARTY_NOTICES.txt'];
    expect(checkSite(makeDist(noFile)).map((f) => f.reference)).toEqual(expect.arrayContaining(['(THIRD_PARTY_NOTICES.txt)', './THIRD_PARTY_NOTICES.txt']));
    const noLink = validSite();
    noLink['index.html'] = noLink['index.html']!.replace(/<footer>.*<\/footer>/, '');
    expect(checkSite(makeDist(noLink)).map((f) => f.rule)).toEqual([expect.stringMatching(/no link to THIRD_PARTY_NOTICES/)]);
  });

  it('accepts the notice link as a string literal of the Entry_Bundle (the footer is rendered by React)', () => {
    const files = validSite();
    files['index.html'] = files['index.html']!.replace(/<footer>.*<\/footer>/, '');
    files['assets/app.js'] += 'createElement("a",{href:"./THIRD_PARTY_NOTICES.txt"});';
    expect(checkSite(makeDist(files))).toEqual([]);
  });

  it('does not scan strings in a copied app bundle', () => {
    const files = validSite();
    files['hand/assets/app.js'] = 'const u="https://example.invalid/docs";// see https://other.example/';
    files['hand/index.html'] = '<script type="module" src="assets/app.js"></script>';
    expect(checkSite(makeDist(files))).toEqual([]);
  });
});

describe('checkSite engine bundles, first paint, entry size, and policy of /', () => {
  const ENGINE = {
    'assets/engine-light-AAA.js': 'import{a}from"./common-CCC.js";import{b}from"./app.js";new Worker(new URL(""+new URL("worker-entry-WWW.js",import.meta.url).href,import.meta.url));',
    'assets/engine-hand-BBB.js': 'import{a}from"./common-CCC.js";new URL(""+new URL("mujoco-MMM.wasm",import.meta.url));new URL(""+new URL("sim-worker-SSS.js",import.meta.url));',
    'assets/common-CCC.js': 'export const a=1;const u="https://engine.example/inside-a-string";',
    'assets/worker-entry-WWW.js': 'const w=new URL("sql-wasm-QQQ.wasm",self.location.href).href;',
    'assets/sim-worker-SSS.js': 'const u="https://worker.example/x";',
    'assets/mujoco-MMM.wasm': 'w',
    'assets/sql-wasm-QQQ.wasm': 'w',
  };
  const withEngines = (): Record<string, string> => ({
    ...validSite(),
    ...ENGINE,
    'assets/app.js': `import("./engine-light-AAA.js");import("./engine-hand-BBB.js");const r="${REPO}";`,
  });

  it('accepts engine chunks, their workers and wasm files, and does not scan their strings', () => {
    expect(checkSite(makeDist(withEngines()))).toEqual([]);
  });

  it('flags a wasm or worker file that an engine chunk names but the site lacks', () => {
    for (const gone of ['assets/mujoco-MMM.wasm', 'assets/sql-wasm-QQQ.wasm', 'assets/sim-worker-SSS.js', 'assets/worker-entry-WWW.js']) {
      const files = withEngines();
      delete files[gone];
      expect(checkSite(makeDist(files)).some((f) => /does not exist/.test(f.rule)), gone).toBe(true);
    }
  });

  it('flags an engine chunk, the shared chunk, or a wasm file named in index.html', () => {
    for (const tag of [
      '<script type="module" src="assets/engine-hand-BBB.js"></script>',
      '<link rel="modulepreload" href="assets/engine-light-AAA.js">',
      '<link rel="modulepreload" href="assets/common-CCC.js">',
      '<link rel="preload" href="assets/mujoco-MMM.wasm" as="fetch">',
    ]) {
      const files = withEngines();
      files['index.html'] += tag;
      expect(checkSite(makeDist(files)).map((f) => f.rule.split(':')[0]), tag).toContain('first-paint');
    }
  });

  it('flags a static import of an engine chunk in the entry, and allows a dynamic import', () => {
    const files = withEngines();
    files['assets/app.js'] = 'import{x}from"./engine-light-AAA.js";' + files['assets/app.js'];
    expect(checkSite(makeDist(files)).map((f) => f.rule)).toEqual([expect.stringMatching(/static import of an Engine_Bundle/)]);
    const shared = withEngines();
    shared['assets/app.js'] = 'import"./common-CCC.js";' + shared['assets/app.js'];
    expect(checkSite(makeDist(shared)).map((f) => f.rule)).toEqual([expect.stringMatching(/static import of an Engine_Bundle/)]);
  });

  it('flags an entry above the limit and accepts one exactly at it', async () => {
    const { ENTRY_MAX_BYTES } = (await import(/* @vite-ignore */ modulePath)) as { ENTRY_MAX_BYTES: number };
    expect(ENTRY_MAX_BYTES).toBe(360_000);
    const at = withEngines();
    at['assets/app.js'] = at['assets/app.js']!.padEnd(ENTRY_MAX_BYTES, ' ');
    expect(checkSite(makeDist(at))).toEqual([]);
    const over = withEngines();
    over['assets/app.js'] = over['assets/app.js']!.padEnd(ENTRY_MAX_BYTES + 1, ' ');
    expect(checkSite(makeDist(over)).map((f) => f.rule)).toEqual([expect.stringMatching(/larger than the limit/)]);
  });

  it('requires worker-src, connect-src \'self\', and wasm-unsafe-eval in the policy of /', () => {
    const cases: Array<[string, string]> = [
      ["worker-src 'self'; ", ''],
      ["connect-src 'self'", "connect-src 'none'"],
      ["'wasm-unsafe-eval'", ''],
      ["connect-src 'self'", "connect-src 'self' 'none'"],
    ];
    for (const [from, to] of cases) {
      const files = validSite();
      files['_headers'] = HEADERS.replace(from, to);
      const rules = checkSite(makeDist(files)).map((f) => f.rule.split(':')[0]);
      expect(rules, `${from} -> ${to}`).toContain('headers-policy');
    }
    // The /shell/* block is not held to this rule.
    const shell = validSite();
    shell['_headers'] = HEADERS.replace(SHELL_POLICY, "default-src 'none'");
    expect(checkSite(makeDist(shell))).toEqual([]);
  });

  it('accepts wasm-unsafe-eval and rejects unsafe-eval', () => {
    const files = validSite();
    files['_headers'] = HEADERS.replace("'wasm-unsafe-eval'", "'wasm-unsafe-eval' 'unsafe-eval'");
    expect(checkSite(makeDist(files)).map((f) => f.reference).join(' ')).toContain("'unsafe-eval'");
  });
});
