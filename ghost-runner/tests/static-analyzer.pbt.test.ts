import { readFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/static/analyzer.js';
import { NUM_RUNS, PBT_MODE, pbtParams, testTimeoutMs } from './pbt-config.js';

// Feature: ghost-runner, Property 16: Static analysis is exact, pure, and I/O free
// **Validates: Requirements 2.7, 2.8, 15.2, 15.5**

const req = createRequire(import.meta.url);
const IO_MODULES = ['fs', 'fs/promises', 'net', 'dns', 'dns/promises', 'child_process'] as const;

/** Run `fn` with every function export of the I/O modules replaced by a counting wrapper. */
function withIoSpies<T>(fn: () => T): { result: T; calls: string[] } {
  const calls: string[] = [];
  const restore: Array<() => void> = [];
  for (const name of IO_MODULES) {
    const mod = req(`node:${name}`) as Record<string, unknown>;
    for (const key of Object.getOwnPropertyNames(mod)) {
      const desc = Object.getOwnPropertyDescriptor(mod, key);
      if (!desc || !desc.configurable || !desc.writable || typeof desc.value !== 'function') continue;
      const original = desc.value as (...a: unknown[]) => unknown;
      const wrapper = function (this: unknown, ...a: unknown[]): unknown {
        calls.push(`${name}.${key}`);
        return original.apply(this, a);
      };
      Object.defineProperties(wrapper, Object.getOwnPropertyDescriptors(original));
      mod[key] = wrapper;
      restore.push(() => {
        mod[key] = original;
      });
    }
  }
  syncBuiltinESMExports();
  try {
    return { result: fn(), calls };
  } finally {
    for (const r of restore) r();
    syncBuiltinESMExports();
  }
}

const word = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);
// Safe tokens: no leading `/` or `~`, no `://`, no shell operators.
const safeToken = fc.oneof(
  word,
  word.map((w) => `-${w}`),
  fc.tuple(word, word).map(([a, b]) => `${a}/${b}.txt`),
  word.map((w) => `/work/${w}`),
);

type Kind = 'external-path' | 'url' | 'db-connection';
interface Planted {
  readonly kind: Kind;
  readonly dest: string;
}

const seg = fc.stringMatching(/^[a-z0-9]{1,8}$/);
const plantedArb = (id: number): fc.Arbitrary<Planted> =>
  fc.oneof(
    seg.map((s): Planted => ({ kind: 'external-path', dest: `/etc/p${id}${s}` })),
    seg.map((s): Planted => ({ kind: 'external-path', dest: `/tmp/p${id}${s}/f` })),
    seg.map((s): Planted => ({ kind: 'external-path', dest: `~/p${id}${s}` })),
    fc
      .tuple(fc.constantFrom('http', 'https', 'ftp', 'ssh'), seg)
      .map(([sc, s]): Planted => ({ kind: 'url', dest: `${sc}://h${id}.example/${s}` })),
    fc
      .tuple(fc.constantFrom('postgres', 'mysql', 'mongodb', 'redis', 'amqp'), seg)
      .map(([sc, s]): Planted => ({ kind: 'db-connection', dest: `${sc}://u@d${id}.example/${s}` })),
  );

type Quote = 'none' | 'single' | 'double';
const quote = (s: string, q: Quote): string =>
  q === 'single' ? `'${s}'` : q === 'double' ? `"${s}"` : s;

const commandArb = fc.integer({ min: 0, max: 6 }).chain((k) =>
  fc
    .tuple(
      fc.tuple(...Array.from({ length: k }, (_, i) => plantedArb(i))),
      fc.array(fc.constantFrom<Quote>('none', 'single', 'double'), { minLength: k, maxLength: k }),
      fc.array(safeToken, { minLength: 0, maxLength: 8 }),
      fc.infiniteStream(fc.nat(1000)),
    )
    .map(([planted, quotes, safe, rnd]) => {
      const tokens: string[] = [...safe];
      const it = rnd[Symbol.iterator]();
      planted.forEach((p, i) => {
        const pos = (it.next().value as number) % (tokens.length + 1);
        tokens.splice(pos, 0, quote(p.dest, quotes[i] as Quote));
      });
      return { command: tokens.join(' '), planted: planted as Planted[] };
    }),
);

describe('Property 16: Static analysis is exact, pure, and I/O free', () => {
  it(
    'returns exactly the planted destinations, is repeatable, and performs no I/O',
    () => {
      let runs = 0;
      let nonEmpty = 0;
      fc.assert(
        fc.property(commandArb, ({ command, planted }) => {
          runs++;
          const action = { command };
          const { result: first, calls } = withIoSpies(() => analyze(action));
          const second = analyze(action);

          expect(calls).toEqual([]);
          expect(second).toEqual(first);
          expect(first).toHaveLength(planted.length);
          if (planted.length === 0) expect(first).toEqual([]);
          else nonEmpty++;
          for (const e of first) expect(e.destination.length).toBeGreaterThan(0);
          const key = (k: string, d: string): string => `${k}\u0000${d}`;
          expect(new Set(first.map((e) => key(e.kind, e.destination)))).toEqual(
            new Set(planted.map((p) => key(p.kind, p.dest))),
          );
        }),
        pbtParams(false),
      );
      console.log(`Property 16: runs executed=${runs} (mode=${PBT_MODE}, numRuns=${NUM_RUNS}, k>0 cases=${nonEmpty})`);
      expect(runs).toBeGreaterThanOrEqual(Math.min(NUM_RUNS, 20));
    },
    testTimeoutMs(false) || undefined,
  );

  it('imports none of fs, net, dns, child_process (source check)', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/static/analyzer.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/from\s+['"](?:node:)?(?:fs|net|dns|child_process)(?:\/promises)?['"]/);
    expect(src).not.toMatch(/require\(\s*['"](?:node:)?(?:fs|net|dns|child_process)/);
  });

  it('spies detect fs and child_process calls (guards against a vacuous spy)', () => {
    const fsMod = req('node:fs') as typeof import('node:fs');
    const { calls } = withIoSpies(() => fsMod.existsSync('/'));
    expect(calls).toContain('fs.existsSync');
  });

  it('returns [] for an empty command', () => {
    expect(analyze({ command: '' })).toEqual([]);
  });
});
