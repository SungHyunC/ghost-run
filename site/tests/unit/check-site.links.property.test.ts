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

const segment = fc.constantFrom('a', 'b', 'c', 'd');
const targetArb = fc.record({
  dirs: fc.array(segment, { maxLength: 2 }),
  name: fc.constantFrom('x.png', 'y.js', 'z.wasm'),
});
const holderArb = fc.record({
  dirs: fc.array(segment, { maxLength: 2 }),
  kind: fc.constantFrom('html', 'css', 'js'),
});
const refArb = fc.record({
  holder: holderArb,
  target: targetArb,
  exists: fc.boolean(),
  absolute: fc.boolean(),
  suffix: fc.constantFrom('', '?v=1', '#frag', '?v=1#frag'),
  asIndex: fc.boolean(),
});

function holderFile(holder: { dirs: string[]; kind: string }, n: number): string {
  return [...holder.dirs, `holder${n}.${holder.kind}`].join('/');
}

function write(root: string, rel: string, text: string): void {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
}

describe('checkSite local links (property)', () => {
  // Feature: site, Property 4: Every local link resolves
  // **Validates: Requirements 20.1, 20.2, 20.3, 20.6, 20.7, 20.8**
  it(
    'reports a finding exactly for the references whose target does not exist',
    () => {
      fc.assert(
        fc.property(fc.array(refArb, { minLength: 1, maxLength: 6 }), fc.array(fc.boolean(), { maxLength: 3 }), (refs, idFlags) => {
          const root = mkdtempSync(path.join(tmpdir(), 'check-site-prop-'));
          try {
            const bodies = new Map<string, string[]>();
            const expected: Array<{ file: string; reference: string }> = [];
            refs.forEach((item, n) => {
              const file = holderFile(item.holder, n);
              const targetDir = item.asIndex ? [...item.target.dirs, 'pg'] : item.target.dirs;
              const targetFile = item.asIndex ? [...targetDir, 'index.html'].join('/') : [...item.target.dirs, item.target.name].join('/');
              const missingFile = item.asIndex ? [...item.target.dirs, `pgm${n}`, 'index.html'].join('/') : [...item.target.dirs, `missing${n}-${item.target.name}`].join('/');
              const real = item.exists ? targetFile : missingFile;
              if (item.exists) write(root, targetFile, '');
              let value: string;
              const from = item.holder.dirs.join('/') || '.';
              if (item.asIndex) {
                const dir = path.posix.dirname(real);
                value = item.absolute ? `/${dir}/` : `${path.posix.relative(from, dir) || '.'}/`;
              } else {
                value = item.absolute ? `/${real}` : path.posix.relative(from, real);
              }
              if (!value.startsWith('/') && !value.startsWith('.')) value = `./${value}`;
              value += item.suffix;
              const parts = bodies.get(file) ?? [];
              if (item.holder.kind === 'html') parts.push(`<a href="${value}">l</a>`);
              else if (item.holder.kind === 'css') parts.push(`.k${n}{background:url("${value}")}`);
              else parts.push(`new URL("${value}",import.meta.url);`);
              bodies.set(file, parts);
              if (!item.exists) expected.push({ file, reference: value });
            });
            const sameFile = idFlags.map((hasId, i) => ({ hasId, id: `id${i}` }));
            const htmlHolders = [...bodies.keys()].filter((f) => f.endsWith('.html'));
            for (const [file, parts] of bodies) {
              if (file === htmlHolders[0]) {
                for (const { hasId, id } of sameFile) {
                  parts.push(`<a href="#${id}">f</a>`);
                  if (hasId) parts.push(`<p id="${id}"></p>`);
                  else expected.push({ file, reference: `#${id}` });
                }
              }
            }
            for (const [file, parts] of bodies) write(root, file, parts.join('\n'));
            const sortKey = (f: { file: string; reference: string }) => `${f.file}\u0000${f.reference}`;
            const actual = checkSite(root, { structure: false }).map((f) => ({ file: f.file, reference: f.reference }));
            const norm = (list: Array<{ file: string; reference: string }>) => list.map(sortKey).sort();
            const a = norm(actual);
            const e = norm(expected);
            if (JSON.stringify(a) !== JSON.stringify(e)) {
              throw new Error(`expected ${JSON.stringify(e)} but got ${JSON.stringify(a)}`);
            }
          } finally {
            rmSync(root, { recursive: true, force: true });
          }
        }),
        { numRuns: NUM_RUNS, verbose: true },
      );
    },
    PBT_TIMEOUT,
  );
});
