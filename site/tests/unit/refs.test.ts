import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Loaded by variable path so that the plain .mjs script needs no type declaration file.
const modulePath = '../../scripts/lib/refs.mjs';
const { classifyRef, extractRefs, extractHtmlRefs, extractCssRefs, extractJsRefs } = (await import(
  /* @vite-ignore */ modulePath
)) as {
  classifyRef: (value: string) => { kind: string; path?: string; query?: string; fragment?: string };
  extractRefs: (file: string, text: string) => Ref[];
  extractHtmlRefs: (text: string) => Ref[];
  extractCssRefs: (text: string) => Ref[];
  extractJsRefs: (text: string) => Ref[];
};

interface Ref {
  value: string;
  source: string;
  tag?: string;
  rel?: string;
}

const values = (refs: Ref[]): string[] => refs.map((ref) => ref.value);

describe('extractHtmlRefs', () => {
  it('reads href, src, srcset candidates, poster, and action, and ignores <base>', () => {
    const html = `<!doctype html><html><head><base href="http://base.example/">
      <link rel="icon" href="favicon.svg"><script src="/assets/a.js"></script></head>
      <body><a href="shell/?x=1#top" rel="noopener noreferrer">s</a>
      <img srcset="a.png 1x, /b.png 2x"><video poster="p.png"></video>
      <form action="go/"></form></body></html>`;
    const refs = extractHtmlRefs(html);
    expect(values(refs).sort()).toEqual(
      ['/assets/a.js', '/b.png', 'a.png', 'favicon.svg', 'go/', 'p.png', 'shell/?x=1#top'].sort(),
    );
  });

  it('keeps the tag and rel of the holding element', () => {
    const [ref] = extractHtmlRefs('<a href="x" rel="noopener noreferrer">x</a>');
    expect(ref).toEqual({ value: 'x', source: 'href', tag: 'a', rel: 'noopener noreferrer' });
  });
});

describe('extractCssRefs', () => {
  it('reads quoted and unquoted url() and @import', () => {
    const css = `@import "a.css"; @import url(b.css);
      .x { background: url("img/c.png?v=1#f"); } .y { src: url(/fonts/d.woff2) }
      /* url(commented.png) */`;
    expect(values(extractCssRefs(css)).sort()).toEqual(['/fonts/d.woff2', 'a.css', 'b.css', 'img/c.png?v=1#f']);
  });
});

describe('extractJsRefs', () => {
  it('reads each static form, minified too', () => {
    const js = [
      'const a=await import("./dyn.js");',
      'import x from"./from.js";',
      'import"./side.js";',
      'export{y}from"./re.js";',
      'export * from "./star.js";',
      'const u=new URL("mujoco.wasm",import.meta.url);',
      'new Worker("/w/plain.js");',
      'new Worker(new URL("sim-worker.js",import.meta.url));',
    ].join('\n');
    expect(values(extractJsRefs(js)).sort()).toEqual(
      ['./dyn.js', './from.js', './re.js', './side.js', './star.js', '/w/plain.js', 'mujoco.wasm', 'sim-worker.js'].sort(),
    );
  });

  it('skips dynamic expressions', () => {
    const js = 'import(name); new URL(base + "x.js", import.meta.url); new Worker(path); import(`./a/${n}.js`);';
    expect(extractJsRefs(js)).toEqual([]);
  });
});

describe('extractRefs', () => {
  it('chooses the extractor by extension and ignores other types', () => {
    expect(values(extractRefs('a.css', 'a{b:url(x.png)}'))).toEqual(['x.png']);
    expect(values(extractRefs('a.js', 'import("./x.js")'))).toEqual(['./x.js']);
    expect(extractRefs('a.json', '{"a":"b.png"}')).toEqual([]);
  });
});

describe('classifyRef', () => {
  it.each([
    ['https://a.example/x', 'external'],
    ['http://a.example', 'external'],
    ['//cdn.example/x.js', 'external'],
    ['wss://a.example', 'external'],
    ['ws://a.example', 'external'],
    ['ftp://a.example', 'external'],
    ['data:image/png;base64,AA', 'external'],
    ['#top', 'fragment'],
    ['mailto:a@b.example', 'other'],
    ['', 'empty'],
  ])('%s is %s', (value, kind) => {
    expect(classifyRef(value).kind).toBe(kind);
  });

  it('splits a root-absolute path, query, fragment, and trailing slash', () => {
    expect(classifyRef('/shell/index.html?a=1#frag')).toEqual({
      kind: 'local',
      path: '/shell/index.html',
      query: 'a=1',
      fragment: 'frag',
    });
    expect(classifyRef('hand/')).toEqual({ kind: 'local', path: 'hand/', query: '', fragment: '' });
    expect(classifyRef('./a.css#x')).toEqual({ kind: 'local', path: './a.css', query: '', fragment: 'x' });
  });
});

describe('url-allowlist.json', () => {
  const file = JSON.parse(readFileSync(new URL('../../scripts/url-allowlist.json', import.meta.url), 'utf8')) as {
    strings: { value: string; files: string; reason: string }[];
  };
  const listed = file.strings.map((entry) => entry.value);

  it('holds the five namespace identifiers, the react.dev prefix, and the repository URL', () => {
    expect(listed).toEqual(
      expect.arrayContaining([
        'http://www.w3.org/2000/svg',
        'http://www.w3.org/1999/xlink',
        'http://www.w3.org/1998/Math/MathML',
        'http://www.w3.org/XML/1998/namespace',
        'http://www.w3.org/1999/xhtml',
        'https://react.dev/errors/',
        'https://github.com/SungHyunC/ghost-run',
      ]),
    );
    expect(listed).toHaveLength(7);
  });

  it('gives every entry a value, files, and a reason, and documents react.dev as O2', () => {
    for (const entry of file.strings) {
      expect(entry.value).not.toBe('');
      expect(entry.files).not.toBe('');
      expect(entry.reason.length).toBeGreaterThan(10);
    }
    const react = file.strings.find((entry) => entry.value === 'https://react.dev/errors/');
    expect(react?.reason).toMatch(/O2/);
    expect(react?.reason).toMatch(/never a request target/);
  });
});
