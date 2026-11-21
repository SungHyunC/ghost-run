import * as fc from 'fast-check';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'vitest';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';

type Finding = { file: string; reference: string; rule: string };

const modulePath = '../../scripts/check-site.mjs';
const { checkSite } = (await import(/* @vite-ignore */ modulePath)) as {
  checkSite: (distRoot: string, options?: { structure?: boolean }) => Finding[];
};

const REPO = 'https://github.com/SungHyunC/ghost-run';
const NAMESPACE = 'http://www.w3.org/2000/svg';

const labelArb = fc.stringMatching(/^[a-z]{3,8}$/);
const externalArb = fc
  .tuple(fc.constantFrom('http', 'https'), labelArb, fc.constantFrom('example', 'test', 'invalid'), labelArb)
  .map(([scheme, host, tld, file]) => `${scheme}://${host}.${tld}/${file}`);

type Place = 'html-script-src' | 'html-link-href' | 'html-img-srcset' | 'html-anchor-href' | 'css-url' | 'css-import' | 'js-string' | 'json-string' | 'svg-string';
const placeArb = fc.constantFrom<Place>(
  'html-script-src',
  'html-link-href',
  'html-img-srcset',
  'html-anchor-href',
  'css-url',
  'css-import',
  'js-string',
  'json-string',
  'svg-string',
);

function placeFile(place: Place, value: string): { file: string; text: string } {
  switch (place) {
    case 'html-script-src':
      return { file: 'index.html', text: `<script src="${value}"></script>` };
    case 'html-link-href':
      return { file: 'shell/index.html', text: `<link rel="stylesheet" href="${value}">` };
    case 'html-img-srcset':
      return { file: 'kit/index.html', text: `<img srcset="${value} 2x">` };
    case 'html-anchor-href':
      return { file: 'hand/index.html', text: `<a href="${value}" rel="noopener noreferrer">x</a>` };
    case 'css-url':
      return { file: 'assets/a.css', text: `a{background:url("${value}")}` };
    case 'css-import':
      return { file: 'hand/assets/b.css', text: `@import "${value}";` };
    case 'js-string':
      return { file: 'assets/a.js', text: `const u="${value}";` };
    case 'json-string':
      return { file: 'assets/a.json', text: JSON.stringify({ u: value }) };
    case 'svg-string':
      return { file: 'assets/a.svg', text: `<svg xmlns="${NAMESPACE}"><text>${value}</text></svg>` };
  }
}

function withDist<T>(files: Record<string, string>, run: (root: string) => T): T {
  const root = mkdtempSync(path.join(tmpdir(), 'check-site-ext-'));
  try {
    for (const [rel, text] of Object.entries(files)) {
      const full = path.join(root, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const check = (root: string) => checkSite(root, { structure: false });

describe('checkSite external URLs (property)', () => {
  // Feature: site, Property 5: No external URL
  // **Validates: Requirements 14.3, 19.5, 20.4, 20.5**
  it(
    'reports every non-allowlisted external reference, in every scanned place',
    () => {
      fc.assert(
        fc.property(externalArb, placeArb, (value, place) => {
          const { file, text } = placeFile(place, value);
          const found = withDist({ [file]: text }, check);
          if (!found.some((f) => f.file === file && f.reference === value)) {
            throw new Error(`no finding for ${value} in ${file}: ${JSON.stringify(found)}`);
          }
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
    },
    PBT_TIMEOUT,
  );

  // Feature: site, Property 5: No external URL
  // **Validates: Requirements 20.4, 20.5**
  it(
    'allows the repository URL only as an anchor href with rel="noopener noreferrer"',
    () => {
      const forbidden = fc.constantFrom<[string, string]>(
        ['index.html', `<img src="${REPO}">`],
        ['index.html', `<script src="${REPO}"></script>`],
        ['index.html', `<link rel="stylesheet" href="${REPO}">`],
        ['index.html', `<img srcset="${REPO} 1x">`],
        ['index.html', `<video poster="${REPO}"></video>`],
        ['index.html', `<form action="${REPO}"></form>`],
        ['index.html', `<a href="${REPO}">no rel</a>`],
        ['index.html', `<a href="${REPO}" rel="noopener">half</a>`],
        ['assets/a.css', `a{background:url(${REPO})}`],
        ['assets/a.css', `@import "${REPO}";`],
      );
      fc.assert(
        fc.property(fc.constantFrom('noopener noreferrer', 'noreferrer noopener', 'noopener  noreferrer nofollow'), forbidden, (rel, [file, text]) => {
          const anchor = `<a href="${REPO}" rel="${rel}">GitHub</a>`;
          const ok = withDist({ 'index.html': anchor, 'assets/app.js': `const r="${REPO}";` }, check);
          if (ok.length > 0) throw new Error(`anchor flagged: ${JSON.stringify(ok)}`);
          const bad = withDist({ [file]: text }, check);
          if (!bad.some((f) => f.reference === REPO)) throw new Error(`no finding for ${text}`);
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
      const inMeta = withDist(
        { 'index.html': `<meta http-equiv="Content-Security-Policy" content="connect-src ${REPO}">` },
        (root) => checkSite(root),
      );
      if (!inMeta.some((f) => f.file === 'index.html' && /repository URL in a Content/.test(f.rule))) {
        throw new Error('the repository URL in the meta CSP was not flagged');
      }
      const inHeaders = withDist(
        { _headers: `/\n  Content-Security-Policy: connect-src ${REPO}\n` },
        (root) => checkSite(root),
      );
      if (!inHeaders.some((f) => f.file === '_headers' && /repository URL/.test(f.rule))) {
        throw new Error('the repository URL in the CSP was not flagged');
      }
    },
    PBT_TIMEOUT,
  );

  // Feature: site, Property 5: No external URL
  // **Validates: Requirements 20.4**
  it(
    'gives no finding for a URL-looking string inside a copied app bundle, and none for allowlisted namespaces',
    () => {
      fc.assert(
        fc.property(externalArb, fc.constantFrom('shell', 'hand', 'kit/gallery'), (value, app) => {
          const files = {
            [`${app}/assets/app.js`]: `const u="${value}";// ${value}\nconst n="${NAMESPACE}";`,
            'assets/landing.js': `const n="${NAMESPACE}";const e="https://react.dev/errors/";`,
          };
          const found = withDist(files, check);
          if (found.length > 0) throw new Error(`unexpected findings: ${JSON.stringify(found)}`);
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
    },
    PBT_TIMEOUT,
  );
});
