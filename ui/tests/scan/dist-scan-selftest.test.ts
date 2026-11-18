import { describe, expect, it } from 'vitest';
import { CSP_POLICY, scanDist, type DistFile, type DistRule } from '../support/dist-scan';

// URLs are built from pieces and reserved hosts so that no real URL is committed.
const SCHEME = 'https' + ':/' + '/';
const foreign = (host: string, path = '/x'): string => SCHEME + host + path;
const REAL = 'cdn.' + 'real-host.' + 'com';
const RESERVED = 'cdn.' + 'fixtures.' + 'example';

const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}">`;
const page = (body = '', head = ''): string =>
  `<!doctype html><html><head>${meta}${head}</head><body>${body}<script type="module" src="./assets/a.js"></script></body></html>`;

const clean = (): DistFile[] => [
  { path: 'index.html', text: page('<img src="./a.svg"><a href="' + foreign('x.example', '/') + '">ok</a>') },
  { path: 'assets/a.js', text: 'export const a = 1; const ns = "' + 'http' + ':/' + '/www.w3.org/2000/svg";' },
  { path: 'assets/a.css', text: "@import './b.css'; .a { background: url(#mask); } .b { background: url(./i.svg); }" },
  { path: 'assets/a.svg', text: '<svg xmlns="' + 'http' + ':/' + '/www.w3.org/2000/svg"></svg>' },
  { path: 'robots.txt', text: 'ok' },
];

const rules = (files: DistFile[]): DistRule[] => scanDist(files).map((v) => v.rule);

function withFile(path: string, text: string): DistFile[] {
  return [...clean().filter((f) => f.path !== path), { path, text }];
}

describe('scanDist self-test', () => {
  it('accepts the clean sample', () => {
    expect(scanDist(clean())).toEqual([]);
  });

  it('flags an external origin but allows reserved hosts', () => {
    expect(rules(withFile('assets/a.js', `const u = "${foreign(REAL)}";`))).toContain('external-origin');
    expect(rules(withFile('assets/a.js', `const u = "${foreign(RESERVED)}";`))).toEqual([]);
    expect(rules(withFile('assets/a.js', `const u = "//${REAL}/x";`))).toContain('external-origin');
  });

  it('flags references to another origin in HTML and CSS', () => {
    const tags = [
      `<script src="${foreign(RESERVED)}"></script>`,
      `<link rel="stylesheet" href="${foreign(RESERVED)}">`,
      `<img src="${foreign(RESERVED)}">`,
      `<iframe src="${foreign(RESERVED)}"></iframe>`,
      `<form action="${foreign(RESERVED)}"></form>`,
    ];
    for (const tag of tags) {
      expect(rules(withFile('index.html', page(tag)))).toContain('foreign-reference');
    }
    expect(rules(withFile('assets/a.css', `@import "${foreign(RESERVED)}";`))).toContain('foreign-reference');
    expect(rules(withFile('assets/a.css', `.a{background:url(${foreign(RESERVED)})}`))).toContain('foreign-reference');
  });

  it('flags network API use', () => {
    const samples = [
      'fetch ("x")',
      'new XMLHttpRequest()',
      'new WebSocket("x")',
      'navigator.sendBeacon("x")',
      'new EventSource("x")',
      'importScripts("x")',
      'navigator.serviceWorker.register("x")',
    ];
    for (const s of samples) {
      expect(rules(withFile('assets/a.js', s))).toContain('network-api');
    }
  });

  it('flags analytics words, case-insensitively', () => {
    expect(rules(withFile('assets/a.js', 'var t = "GoogleTagManager";'))).toContain('analytics');
    expect(rules(withFile('assets/a.js', 'Sentry.init()'))).toContain('analytics');
  });

  it('flags remote fonts', () => {
    const face = `@font-face { font-family: F; src: url(${foreign(RESERVED, '/f.woff2')}); }`;
    expect(rules(withFile('assets/a.css', face))).toContain('remote-font');
    expect(rules(withFile('assets/a.css', '.a{font-family:x} /* //fonts.fixtures.example/x */'))).toContain('remote-font');
  });

  it('flags inline script and javascript: URLs', () => {
    expect(rules(withFile('index.html', page('<script>var a = 1;</script>')))).toContain('inline-script');
    expect(rules(withFile('index.html', page('<a href="javascript:void(0)">x</a>')))).toContain('inline-script');
  });

  it('requires the CSP meta tag with the exact policy', () => {
    const noMeta = page().replace(meta, '');
    expect(rules(withFile('index.html', noMeta))).toContain('csp-missing');
    const altered = page().replace(CSP_POLICY, CSP_POLICY.replace("'none'", "'self'"));
    expect(rules(withFile('index.html', altered))).toContain('csp-missing');
    expect(rules(clean().filter((f) => f.path !== 'index.html'))).toContain('csp-missing');
  });

  it('accepts only static file types', () => {
    expect(rules([...clean(), { path: 'assets/a.js.map', text: '{}' }])).toEqual(['file-type']);
    expect(rules([...clean(), { path: 'font.woff2', text: '' }])).toContain('file-type');
  });

  it('flags axe-core code in the bundle', () => {
    expect(rules(withFile('assets/a.js', 'import "axe-core";'))).toContain('axe-core');
    expect(rules(withFile('assets/a.js', 'axe.run(document)'))).toContain('axe-core');
  });

  it('suppresses a violation only through a matching allow-list entry', () => {
    const files = withFile('assets/a.js', 'Sentry.init()');
    expect(scanDist(files, [{ rule: 'analytics', contains: 'sentry', reason: 'fixture' }])).toEqual([]);
    expect(scanDist(files, [{ rule: 'network-api', contains: 'sentry', reason: 'fixture' }])).not.toEqual([]);
  });
});
