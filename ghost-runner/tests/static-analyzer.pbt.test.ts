import { readFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/static/analyzer.js';
import { HARMLESS_DEVICE_PATHS } from '../src/static/devices.js';
import { mapCwdToCopy, mapOriginalToCopy } from '../src/static/original-roots.js';
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

const DEVICES: readonly string[] = [...HARMLESS_DEVICE_PATHS, '/dev/fd/0', '/dev/fd/12'];
const deviceRedirect = fc
  .tuple(fc.constantFrom('>', '>>', '2>', '2>>', '&>', '&>>'), fc.constantFrom(...DEVICES), fc.boolean())
  .map(([op, dev, spaced]) => (spaced ? `${op} ${dev}` : `${op}${dev}`));

const DEVICE_UNIT_CASES = DEVICES.flatMap((d) => [
  `echo hi > ${d}`,
  `echo hi 2>${d}`,
  `echo hi &>${d}`,
  `curl -o ${d} --output=${d} x`,
]);

describe('harmless device paths', () => {
  it.each(DEVICE_UNIT_CASES)('no effect: %s', (command) => {
    expect(analyze({ command })).toEqual([]);
  });

  it.each(['/dev/sda', '/dev/null/x', '/dev/fd/x', '/dev/fd/', '/dev/fd/../sda', '/dev/nullx'])(
    'still an external-path: %s',
    (dev) => {
      for (const command of [`echo hi > ${dev}`, `echo hi 2>${dev}`, `curl -o ${dev} x`]) {
        expect(analyze({ command })).toEqual([{ kind: 'external-path', destination: dev }]);
      }
    },
  );

  it('a URL next to > /dev/null is the only effect', () => {
    expect(analyze({ command: 'curl -s https://example.com > /dev/null' })).toEqual([
      { kind: 'url', destination: 'https://example.com' },
    ]);
  });
});

describe('Property 16: Static analysis is exact, pure, and I/O free', () => {
  it(
    'a redirect to a harmless device path adds no effect; planted destinations are still found',
    () => {
      fc.assert(
        fc.property(commandArb, deviceRedirect, ({ command, planted }, redirect) => {
          const base = analyze({ command });
          const withRedirect = analyze({ command: `${command} ${redirect}` });
          expect(withRedirect).toEqual(base);
          const found = new Set(withRedirect.map((e) => `${e.kind}\u0000${e.destination}`));
          for (const p of planted) expect(found.has(`${p.kind}\u0000${p.dest}`)).toBe(true);
        }),
        pbtParams(false),
      );
    },
    testTimeoutMs(false),
  );

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
    testTimeoutMs(false),
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

  it('regression: "${" is reported as an unparseable command instead of throwing', () => {
    const effects = analyze({ command: '${' });
    expect(effects).toHaveLength(1);
    expect(effects[0]?.kind).toBe('unparseable-command');
    expect(effects[0]?.destination.length).toBeGreaterThan(0);
  });

  it('still extracts URLs from the raw text of an unparseable command', () => {
    const effects = analyze({ command: '${ curl https://collect.invalid/x' });
    expect(effects.map((e) => e.kind).sort()).toEqual(['unparseable-command', 'url']);
  });

  it('never throws on any string, including shell fragments', () => {
    const fragment = fc.constantFrom('${', '$(', '`', '"', "'", '\\', '$((', '${a', '$(a', '<(', '|', ';', '&&', ' ');
    const noisy = fc
      .array(fc.oneof(fragment, fc.string({ maxLength: 6 }), safeToken), { maxLength: 10 })
      .map((parts) => parts.join(''));
    fc.assert(
      fc.property(fc.oneof(noisy, fc.string({ maxLength: 40 })), (command) => {
        let effects: ReturnType<typeof analyze> = [];
        expect(() => {
          effects = analyze({ command });
        }).not.toThrow();
        for (const e of effects) expect(e.destination.length).toBeGreaterThan(0);
        expect(analyze({ command })).toEqual(effects);
      }),
      pbtParams(false),
    );
  }, testTimeoutMs(false));
});

const ROOT = '/home/dev/project';
const ROOTS = [ROOT, '/private/home/dev/project'];

describe('Original root counts as inside (Requirement 2.7)', () => {
  it.each([
    `cd ${ROOT} && ls`,
    `cat ${ROOT}/README.md`,
    `cp ${ROOT}/a ${ROOT}/b`,
    `cd '${ROOT}' && ls`,
    `ls --dir=${ROOT}/src`,
    `cd /private/home/dev/project/src && ls`,
  ])('no effect: %s', (command) => {
    expect(analyze({ command }, ROOTS)).toEqual([]);
  });

  it.each([`${ROOT}/../secret`, `${ROOT}-demo/x`, `${ROOT}2`, '/etc/passwd', '/home/dev'])(
    'still an external-path: %s',
    (dest) => {
      expect(analyze({ command: `cat ${dest}` }, ROOTS)).toEqual([{ kind: 'external-path', destination: dest }]);
    },
  );

  it('without roots the Original path is external (default)', () => {
    expect(analyze({ command: `cd ${ROOT}` })).toEqual([{ kind: 'external-path', destination: ROOT }]);
  });

  it('~ paths, URLs, and connection strings stay external', () => {
    const kinds = analyze({ command: `cat ~/x https://a.example postgres://u@d.example/db ${ROOT}/ok` }, ROOTS).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual(['external-path', 'url', 'db-connection']);
  });

  it(
    'property: <root>/<rel> anywhere in a command adds no effect; planted external paths are still found',
    () => {
      const rootArb = fc
        .array(fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/), { minLength: 1, maxLength: 4 })
        .map((segs) => `/${segs.join('/')}`);
      const relArb = fc
        .array(fc.stringMatching(/^[a-z0-9][a-z0-9]{0,6}$/), { minLength: 0, maxLength: 3 })
        .map((segs) => segs.join('/'));
      fc.assert(
        fc.property(rootArb, relArb, commandArb, fc.nat(20), (root, rel, { command, planted }, pos) => {
          // A generated external path must not itself fall under the generated root.
          fc.pre(planted.every((p) => p.kind !== 'external-path' || !(p.dest === root || p.dest.startsWith(`${root}/`))));
          const inside = rel === '' ? root : `${root}/${rel}`;
          const tokens = command.split(' ');
          tokens.splice(pos % (tokens.length + 1), 0, inside);
          const withInside = tokens.join(' ');
          const effects = analyze({ command: withInside }, [root]);
          expect(effects).toEqual(analyze({ command }, [root]));
          const found = new Set(effects.map((e) => `${e.kind}\u0000${e.destination}`));
          for (const p of planted) expect(found.has(`${p.kind}\u0000${p.dest}`)).toBe(true);
        }),
        pbtParams(false),
      );
    },
    testTimeoutMs(false),
  );
});

describe('mapOriginalToCopy', () => {
  it.each([
    [`cd ${ROOT} && ls`, 'cd /work && ls'],
    [`cat ${ROOT}/README.md`, 'cat /work/README.md'],
    [`cp ${ROOT}/a ${ROOT}/b`, 'cp /work/a /work/b'],
    [`cd "${ROOT}";ls`, 'cd "/work";ls'],
    [`(cd ${ROOT})`, '(cd /work)'],
    [`ls ${ROOT}|wc`, 'ls /work|wc'],
    ['cd /private/home/dev/project/src', 'cd /work/src'],
    [`cd ${ROOT}-demo`, `cd ${ROOT}-demo`],
    [`cd ${ROOT}2`, `cd ${ROOT}2`],
    [`cd /x${ROOT}`, `cd /x${ROOT}`],
    [ROOT, '/work'],
  ])('%s -> %s', (text, expected) => {
    expect(mapOriginalToCopy(text, ROOTS)).toBe(expected);
  });

  it('maps an absolute cwd to a path relative to the Copy root', () => {
    expect(mapCwdToCopy(ROOT, ROOTS)).toBeUndefined();
    expect(mapCwdToCopy(`${ROOT}/src/a`, ROOTS)).toBe('src/a');
    expect(mapCwdToCopy('src', ROOTS)).toBe('src');
    expect(mapCwdToCopy(`${ROOT}-demo`, ROOTS)).toBe(`${ROOT}-demo`);
  });

  it('does nothing without roots or with the filesystem root', () => {
    expect(mapOriginalToCopy('cd /etc', [])).toBe('cd /etc');
    expect(mapOriginalToCopy('cd /etc', ['/'])).toBe('cd /etc');
  });
});
