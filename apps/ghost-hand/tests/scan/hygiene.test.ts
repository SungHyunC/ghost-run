import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exitCodeFor, formatReport, scanTexts } from '@ghost-run/core';

// Source hygiene for Ghost Hand. Validates: Requirements 1.4, 1.5, 1.7, 1.13, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7.

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const appRoot = join(repoRoot, 'apps/ghost-hand');
const worldRoot = join(repoRoot, 'worlds/drawer-arm');
const specRoot = join(repoRoot, '.kiro/specs/ghost-hand');
const SELF = fileURLToPath(import.meta.url);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-node']);
const BINARY_EXT = /\.(wasm|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|ogg|wav|mp4|webm|zip|gz|tgz|pdf|tsbuildinfo)$/i;
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function walk(dir: string, accept: (name: string) => boolean = () => true): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, accept));
    else if (accept(name)) out.push(full);
  }
  return out;
}

const rel = (p: string): string => relative(repoRoot, p);
const read = (p: string): string => readFileSync(p, 'utf8');

// Built from pieces so that this file holds no literal opener.
const HTML_COMMENT_OPENER = '<' + '!' + '--';

describe('hidden characters in repository sources', () => {
  it('the scanner flags hidden code points and an HTML comment opener (self check)', () => {
    const zeroWidth = scanTexts([{ path: 'a.ts', text: 'a\u200Bb' }]);
    expect(zeroWidth.outcome).toBe('findings');
    const opener = scanTexts([{ path: 'a.md', text: `x ${HTML_COMMENT_OPENER} y --> z` }]);
    expect(opener.outcome).toBe('findings');
  });

  it('apps/ghost-hand, worlds/drawer-arm, and the ghost-hand spec scan clean', () => {
    const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
    const files = [appRoot, worldRoot, specRoot]
      .flatMap((root) => walk(root, (name) => !BINARY_EXT.test(name) && name !== '.DS_Store'));
    expect(files.length).toBeGreaterThan(50);
    const inputs = files.map((f) => ({ path: rel(f), text: decoder.decode(readFileSync(f)) }));
    const report = scanTexts(inputs);
    const text = formatReport(report);
    expect(report.outcome, text).toBe('clean');
    expect(exitCodeFor(report.outcome)).toBe(0);
  });
});

// Source files whose behavior ships or runs: app and world sources, scripts, and tests.
const appSources = walk(join(appRoot, 'src'), (n) => CODE_EXT.test(n));
const worldSources = [
  ...walk(join(worldRoot, 'src'), (n) => CODE_EXT.test(n)),
  ...(existsSync(join(worldRoot, 'world.config.ts')) ? [join(worldRoot, 'world.config.ts')] : []),
];
const runtimeSources = [...appSources, ...worldSources];
const allCode = [appRoot, worldRoot]
  .flatMap((root) => walk(root, (n) => CODE_EXT.test(n)))
  .filter((f) => f !== SELF);

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('forbidden constructs in runtime sources', () => {
  const forbidden: [string, RegExp][] = [
    ['eval', /\beval\s*\(/],
    ['new Function', /\bnew\s+Function\b/],
    ['Function constructor call', /(^|[^.\w])Function\s*\(/],
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML', /\b(inner|outer)HTML\b|insertAdjacentHTML|document\.write/],
    ['storage API', /\b(localStorage|sessionStorage|indexedDB|openDatabase)\b|document\.cookie|\bcaches\s*\.|navigator\.storage|\bcookieStore\b/],
    ['console', /\bconsole\s*\./],
    ['string timers', /\b(setTimeout|setInterval)\s*\(\s*['"`]/],
  ];
  for (const [label, re] of forbidden) {
    it(`no ${label} in apps/ghost-hand/src or worlds/drawer-arm/src`, () => {
      const hits = runtimeSources
        .filter((f) => re.test(stripComments(read(f))))
        .map(rel);
      expect(hits).toEqual([]);
    });
  }

  it('scripts do not log plan content', () => {
    const scripts = [
      ...walk(join(appRoot, 'scripts'), (n) => CODE_EXT.test(n)),
      ...walk(join(worldRoot, 'scripts'), (n) => CODE_EXT.test(n)),
    ];
    const bad = scripts.filter((f) => /console\s*\.[^\n]*\b(plan|Plan)/.test(stripComments(read(f)))).map(rel);
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------- import graph

const NODE_BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '')));

const PACKAGE_DIRS: Record<string, string> = {
  '@ghost-run/core': join(repoRoot, 'core'),
  '@ghost-run/ui': join(repoRoot, 'ui'),
  '@ghost-run/wards-config': join(repoRoot, 'wards-config'),
  '@ghost-run/drawer-arm': worldRoot,
};

function specifiersOf(text: string): string[] {
  const code = stripComments(text);
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /(?:^|[^.\w])import\s*['"]([^'"]+)['"]/gm,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
    /new\s+Worker\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) found.push(m[1] as string);
  return found;
}

function resolveFile(base: string): string | undefined {
  const stem = base.replace(/\.(m?js|cjs)$/, '');
  const candidates = [
    base,
    `${stem}.ts`,
    `${stem}.tsx`,
    `${stem}.d.ts`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile());
}

interface Graph {
  files: Set<string>;
  externals: Set<string>;
  unresolved: string[];
}

function buildGraph(entryHtml: string): Graph {
  const html = read(entryHtml);
  const queue: string[] = [];
  const graph: Graph = { files: new Set(), externals: new Set(), unresolved: [] };
  for (const m of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) {
    queue.push(resolve(dirname(entryHtml), (m[1] as string).replace(/^\//, './')));
  }
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (graph.files.has(file)) continue;
    graph.files.add(file);
    for (const raw of specifiersOf(read(file))) {
      const spec = raw.replace(/\?.*$/, '');
      const isAssetQuery = raw.includes('?');
      if (spec.startsWith('.') || spec.startsWith('/')) {
        if (isAssetQuery || /\.(json|ya?ml|css|wasm|svg|txt|png)$/.test(spec)) continue;
        const target = resolveFile(resolve(dirname(file), spec));
        if (target === undefined) graph.unresolved.push(`${rel(file)} -> ${raw}`);
        else queue.push(target);
        continue;
      }
      const parts = spec.split('/');
      const pkg = spec.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string);
      const sub = parts.slice(spec.startsWith('@') ? 2 : 1).join('/');
      const dir = PACKAGE_DIRS[pkg];
      if (dir === undefined) {
        graph.externals.add(spec);
        continue;
      }
      if (sub !== '') {
        if (/\.(ya?ml|css|json)$/.test(sub)) continue;
        graph.externals.add(spec); // subpath imports are checked by name below
        continue;
      }
      // Workspace package: follow its source entry, not its build output.
      const entry = resolveFile(join(dir, 'src/index'));
      if (entry === undefined) graph.unresolved.push(`${rel(file)} -> ${raw}`);
      else queue.push(entry);
    }
  }
  return graph;
}

describe('browser import graph from index.html', () => {
  const graph = buildGraph(join(appRoot, 'index.html'));

  it('reaches the app, the world, and the shared packages', () => {
    const names = [...graph.files].map(rel);
    expect(names).toContain('apps/ghost-hand/src/main.tsx');
    expect(names.some((n) => n.startsWith('worlds/drawer-arm/src/'))).toBe(true);
    expect(names.some((n) => n.startsWith('core/src/'))).toBe(true);
    expect(names.some((n) => n.startsWith('wards-config/src/'))).toBe(true);
    expect(names.some((n) => n.startsWith('ui/src/'))).toBe(true);
    expect(names).toContain('apps/ghost-hand/src/worker/sim-worker.ts');
  });

  it('leaves no relative import unresolved', () => {
    expect(graph.unresolved).toEqual([]);
  });

  it('has no node: import and no Node built-in module', () => {
    const bad = [...graph.externals].filter(
      (s) => s.startsWith('node:') || NODE_BUILTINS.has(s.split('/')[0] as string),
    );
    expect(bad).toEqual([]);
  });

  it('has no @ghost-run/wards-config/node import and no CLI source', () => {
    expect([...graph.externals].filter((s) => s.startsWith('@ghost-run/wards-config/'))).toEqual([]);
    expect([...graph.files].map(rel).filter((f) => f.startsWith('apps/ghost-hand/src/cli/'))).toEqual([]);
    const names = [...graph.files].map(rel);
    expect(names.filter((n) => /possession-node|ghost-runner|integrations\//.test(n))).toEqual([]);
  });

  it('keeps node: imports out of every file in the graph', () => {
    const bad = [...graph.files]
      .filter((f) => /['"]node:[a-z/_]+['"]/.test(stripComments(read(f))))
      .map(rel);
    expect(bad).toEqual([]);
  });
});

// -------------------------------------------------------------------- fixtures

describe('fixtures use canary secrets and reserved domains only', () => {
  const fixtureFiles = [
    ...walk(join(appRoot, 'plans')),
    ...walk(join(appRoot, 'tests'), (n) => !BINARY_EXT.test(n)),
    ...walk(join(appRoot, 'src'), (n) => !BINARY_EXT.test(n)),
    ...walk(join(worldRoot, 'tests'), (n) => !BINARY_EXT.test(n)),
    ...walk(join(worldRoot, 'src'), (n) => !BINARY_EXT.test(n)),
    ...walk(worldRoot, (n) => /\.(ya?ml|json)$/.test(n)),
    ...walk(appRoot, (n) => /\.(ya?ml)$/.test(n)),
  ].filter((f, i, all) => f !== SELF && all.indexOf(f) === i);

  const RESERVED_TLD = /(\.(example|test|localhost|invalid)|^localhost)$/i;

  it('every hostname in a URL, email address, or IP literal is reserved', () => {
    const bad: string[] = [];
    for (const f of fixtureFiles) {
      const text = read(f);
      for (const m of text.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@'"`]*@)?([^\s/:?#'"`)>\]]+)/gi)) {
        const host = (m[1] as string).replace(/[.,;]+$/, '');
        if (/^(\$|\{|%|<)/.test(host)) continue;
        if (!RESERVED_TLD.test(host)) bad.push(`${rel(f)}: ${m[0]}`);
      }
      for (const m of text.matchAll(/\b[\w.+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi)) {
        if (!RESERVED_TLD.test(m[1] as string)) bad.push(`${rel(f)}: ${m[0]}`);
      }
      for (const m of text.matchAll(/(?<![\w.])(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?![\w.])/g)) {
        bad.push(`${rel(f)}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every secret-shaped token is a canary', () => {
    const shapes: RegExp[] = [
      /\bsk-[A-Za-z0-9_-]{6,}/g,
      /\bAKIA[0-9A-Z]{12,}/g,
      /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
      /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
      /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\./g,
    ];
    const bad: string[] = [];
    for (const f of fixtureFiles) {
      const text = read(f);
      for (const re of shapes) {
        for (const m of text.matchAll(re)) {
          if (!/canary/i.test(m[0])) bad.push(`${rel(f)}: ${m[0].slice(0, 12)}...`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

// ------------------------------------------------------------------- LLM calls

describe('no call to an LLM API', () => {
  const llmHosts = [
    'api.openai.com',
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
    'bedrock-runtime',
    'api.cohere',
    'api.mistral.ai',
    'api.groq.com',
    'openrouter.ai',
    'api.x.ai',
    'api-inference.huggingface.co',
    'api.together.xyz',
    'api.perplexity.ai',
    'localhost:11434',
  ];
  const llmPackages = [
    'openai',
    '@anthropic-ai/',
    '@google/generative-ai',
    '@google/genai',
    '@aws-sdk/client-bedrock',
    '@mistralai/',
    'cohere-ai',
    'groq-sdk',
    'ollama',
    'langchain',
    '@langchain/',
    '@huggingface/inference',
    'replicate',
    'ai',
    '@ai-sdk/',
  ];

  it('no source or script names an LLM API host or SDK', () => {
    const bad: string[] = [];
    for (const f of allCode) {
      const text = stripComments(read(f));
      for (const host of llmHosts) if (text.includes(host)) bad.push(`${rel(f)}: ${host}`);
      for (const spec of specifiersOf(text)) {
        if (llmPackages.some((p) => (p.endsWith('/') ? spec.startsWith(p) : spec === p || spec.startsWith(`${p}/`)))) {
          bad.push(`${rel(f)}: import ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('neither package.json depends on an LLM SDK', () => {
    for (const dir of [appRoot, worldRoot]) {
      const pkg = JSON.parse(read(join(dir, 'package.json'))) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      const bad = names.filter((n) =>
        llmPackages.some((p) => (p.endsWith('/') ? n.startsWith(p) : n === p)),
      );
      expect(bad, rel(dir)).toEqual([]);
    }
  });
});

// ------------------------------------------------------------------- .gitignore

describe('.gitignore', () => {
  const lines = read(join(repoRoot, '.gitignore'))
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));

  it('lists apps/ghost-hand/dist', () => {
    expect(lines).toContain('apps/ghost-hand/dist');
  });

  it('lists the world build output and the Node build output', () => {
    expect(lines).toContain('worlds/drawer-arm/dist');
    expect(lines).toContain('apps/ghost-hand/dist-node');
  });
});
