// Feature: ghost-runner, Property 13: strace parser extracts exactly the destinations and secret reads
// **Validates: Requirements 8.7, 8.9, 8.10, 9.2, 9.3**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseStrace } from '../src/recorder/parse-strace.js';
import { DEFAULT_SECRET_PATTERNS } from '../src/recorder/secret-patterns.js';
import { pbtParams, testTimeoutMs } from './pbt-config.js';

// ---------- model ----------

const LOOPBACK: Record<string, string> = {
  '127.0.0.2': 'api.example',
  '127.0.0.3': 'Mixed.Test',
  '::1': 'v6.localhost',
};
const resolveLoopback = (a: string): string | undefined => LOOPBACK[a];

function norm(path: string): string {
  const parts: string[] = [];
  for (const s of path.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') parts.pop();
    else parts.push(s);
  }
  return '/' + parts.join('/');
}
const join = (base: string, p: string): string => norm(p.startsWith('/') ? p : `${base}/${p}`);
const underWork = (abs: string): string | undefined =>
  abs === '/work' ? '' : abs.startsWith('/work/') ? abs.slice(6) : undefined;

function isSecretName(name: string): boolean {
  return name === '.env' || name.startsWith('.env.') || name.endsWith('.pem') || name.startsWith('id_rsa');
}

/** strace-style C string quoting (non-ASCII bytes as octal escapes). */
function q(s: string): string {
  let out = '"';
  for (const b of new TextEncoder().encode(s)) {
    const c = String.fromCharCode(b);
    if (c === '"' || c === '\\') out += '\\' + c;
    else if (b < 32 || b > 126) out += '\\' + b.toString(8).padStart(3, '0');
    else out += c;
  }
  return out + '"';
}

type Style = 'bracket' | 'plain' | 'bare';

type ConnTarget =
  | { k: 'v4'; ip: string; port: number }
  | { k: 'v6'; ip: string; port: number }
  | { k: 'mapped'; ip: string; port: number }
  | { k: 'lo'; ip: string; port: number }
  | { k: 'unix' }
  | { k: 'netlink' };

type Op =
  | { t: 'chdir'; path: string; ok: boolean; split: boolean }
  | {
      t: 'open';
      call: 'open' | 'openat' | 'openat2' | 'dirfd';
      path: string;
      dirfdBase: string;
      flags: string;
      ok: boolean;
      split: boolean;
      decor: boolean;
    }
  | { t: 'connect'; target: ConnTarget; ok: boolean; split: boolean }
  | { t: 'noise'; line: string };

const SEG = ['a', 'b', 'sub', '..', '.', 'caf\u00e9', 'we) = 7ird', 'q"uote', 'sp ace'];
const FILES = [
  '.env', '.env.local', 'key.pem', 'id_rsa', 'id_rsa.pub',
  'readme.md', 'app.js', 'env', '.envrc', 'pem', 'x.pem.txt',
];
const PREFIX = ['', './', '../', '/work/', '/work/a/', '/tmp/', '/etc/', '/work/../tmp/'];
const FLAGS = ['O_RDONLY', 'O_RDONLY|O_CLOEXEC', 'O_RDWR|O_CREAT', 'O_WRONLY|O_CREAT|O_TRUNC', 'O_WRONLY|O_APPEND'];
const DIRS = ['/work', '/work/a', '/work/a/sub', '/tmp'];

const pathArb = fc
  .tuple(fc.constantFrom(...PREFIX), fc.array(fc.constantFrom(...SEG), { maxLength: 3 }), fc.constantFrom(...FILES))
  .map(([p, mid, f]) => p + [...mid, f].join('/'));

const dirPathArb = fc
  .tuple(fc.constantFrom('', '/work/', '/work/a/', '/tmp/', '../'), fc.array(fc.constantFrom(...SEG), { maxLength: 3 }))
  .map(([p, mid]) => (p + mid.join('/')).replace(/\/$/, '') || '.');

const octet = fc.integer({ min: 0, max: 255 });
const extV4 = fc
  .tuple(fc.integer({ min: 1, max: 223 }).filter((n) => n !== 127), octet, octet, octet)
  .map((o) => o.join('.'));
const port = fc.integer({ min: 0, max: 65535 });

const targetArb: fc.Arbitrary<ConnTarget> = fc.oneof(
  fc.record({ k: fc.constant('v4' as const), ip: extV4, port }),
  fc.record({
    k: fc.constant('v6' as const),
    ip: fc.constantFrom('2001:db8::1', '2001:DB8::A', 'fe80::1', '2606:4700::6810:84e5'),
    port,
  }),
  fc.record({ k: fc.constant('mapped' as const), ip: extV4, port }),
  fc.record({
    k: fc.constant('lo' as const),
    ip: fc.constantFrom('127.0.0.1', '127.0.0.2', '127.0.0.3', '127.9.9.9', '::1', '::ffff:127.0.0.2'),
    port,
  }),
  fc.constant({ k: 'unix' as const }),
  fc.constant({ k: 'netlink' as const }),
);

const NOISE = [
  '+++ exited with 0 +++',
  '--- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=5, si_uid=0, si_status=0} ---',
  'read(3, "\\177ELF\\2\\1\\1", 832) = 832',
  'write(1, "hi\\n", 3) = 3',
  'execve("/bin/sh", ["sh", "-c", "x"], 0x7ffd /* 20 vars */) = 0',
  'close(3) = 0',
  'strace: Process 123 attached',
  'connect(3, {sa_family=AF_INET, sin_port=htons(80',
  'openat(AT_FDCWD, ".env"',
  'openat(AT_FDCWD, ".env", O_RDONLY',
  'chdir("a"',
  '<... wait4 resumed>) = 5',
];
const noiseArb = fc.oneof(
  fc.constantFrom(...NOISE),
  fc.string({ maxLength: 40 }).map((s) => '#' + s.replace(/[\r\n]/g, ' ')),
);

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 2, arbitrary: fc.record({ t: fc.constant('chdir' as const), path: dirPathArb, ok: fc.boolean(), split: fc.boolean() }) },
  {
    weight: 5,
    arbitrary: fc.record({
      t: fc.constant('open' as const),
      call: fc.constantFrom('open', 'openat', 'openat2', 'dirfd') as fc.Arbitrary<'open' | 'openat' | 'openat2' | 'dirfd'>,
      path: pathArb,
      dirfdBase: fc.constantFrom(...DIRS),
      flags: fc.constantFrom(...FLAGS),
      ok: fc.boolean(),
      split: fc.boolean(),
      decor: fc.boolean(),
    }),
  },
  { weight: 4, arbitrary: fc.record({ t: fc.constant('connect' as const), target: targetArb, ok: fc.boolean(), split: fc.boolean() }) },
  { weight: 2, arbitrary: noiseArb.map((line) => ({ t: 'noise' as const, line })) },
);

interface Script {
  readonly pid: number;
  readonly style: Style;
  readonly ops: readonly Op[];
}

function dedupePids(raw: { style: Style; ops: Op[] }[]): Script[] {
  let bareUsed = false;
  return raw.map((r, i) => {
    let style = r.style;
    if (style === 'bare') {
      if (bareUsed) style = 'plain';
      bareUsed = true;
    }
    return { pid: 100 + i, style, ops: r.ops };
  });
}

const scenarioArb = fc.record({
  cwd: fc.constantFrom<string | undefined>(undefined, '', 'a', 'a/sub', '/work', '/work/b', '/tmp'),
  scripts: fc
    .array(
      fc.record({
        style: fc.constantFrom<Style>('bracket', 'plain', 'bare'),
        ops: fc.array(opArb, { maxLength: 12 }),
      }),
      { minLength: 1, maxLength: 4 },
    )
    .map(dedupePids),
  schedule: fc.array(fc.nat(50), { minLength: 1, maxLength: 30 }),
  trailingNewline: fc.boolean(),
});

type Expected = Set<string>;

function connectText(t: ConnTarget): { text: string; expected: string | undefined } {
  switch (t.k) {
    case 'v4':
      return { text: `{sa_family=AF_INET, sin_port=htons(${t.port}), sin_addr=inet_addr("${t.ip}")}`, expected: `${t.ip}:${t.port}` };
    case 'mapped':
      return {
        text: `{sa_family=AF_INET6, sin6_port=htons(${t.port}), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "::ffff:${t.ip}", &sin6_addr), sin6_scope_id=0}`,
        expected: `${t.ip}:${t.port}`,
      };
    case 'v6':
      return {
        text: `{sa_family=AF_INET6, sin6_port=htons(${t.port}), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "${t.ip}", &sin6_addr), sin6_scope_id=0}`,
        expected: `[${t.ip.toLowerCase()}]:${t.port}`,
      };
    case 'lo': {
      const v6 = t.ip.includes(':');
      const text = v6
        ? `{sa_family=AF_INET6, sin6_port=htons(${t.port}), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "${t.ip}", &sin6_addr), sin6_scope_id=0}`
        : `{sa_family=AF_INET, sin_port=htons(${t.port}), sin_addr=inet_addr("${t.ip}")}`;
      const key = t.ip.startsWith('::ffff:') ? t.ip.slice(7) : t.ip;
      const host = LOOPBACK[key];
      return { text, expected: host === undefined ? undefined : `${host.toLowerCase()}:${t.port}` };
    }
    case 'unix':
      return { text: '{sa_family=AF_UNIX, sun_path="/var/run/x.sock"}', expected: undefined };
    case 'netlink':
      return { text: '{sa_family=AF_NETLINK, nl_pid=0, nl_groups=00000000}', expected: undefined };
  }
}

/** Render one script into lines and accumulate expected observations. */
function renderScript(script: Script, seedCwd: string, expected: Expected): string[] {
  const lines: string[] = [];
  const prefix = script.style === 'bracket' ? `[pid ${script.pid}] ` : script.style === 'plain' ? `${script.pid}  ` : '';
  const emit = (l: string): void => void lines.push(prefix + l);
  let cwd = seedCwd;

  const callLines = (name: string, args: string, ret: string, split: boolean, tail = ''): void => {
    if (!split) emit(`${name}(${args}) = ${ret}`);
    else {
      emit(`${name}(${args} <unfinished ...>`);
      emit(`<... ${name} resumed>${tail}) = ${ret}`);
    }
  };

  for (const op of script.ops) {
    if (op.t === 'noise') {
      emit(op.line);
    } else if (op.t === 'chdir') {
      callLines('chdir', q(op.path), op.ok ? '0' : '-1 ENOENT (No such file or directory)', op.split);
      if (op.ok) cwd = join(cwd, op.path);
    } else if (op.t === 'connect') {
      const { text, expected: dest } = connectText(op.target);
      callLines('connect', `3<socket:[1234]>, ${text}, 16`, op.ok ? '0' : '-1 EINPROGRESS (Operation now in progress)', op.split);
      if (dest !== undefined) expected.add(`network-attempt|${dest}`);
    } else {
      const base = op.call === 'dirfd' ? op.dirfdBase : cwd;
      const abs = join(base, op.path);
      const ret = op.ok ? (op.decor ? `3<${abs}>` : '3') : '-1 ENOENT (No such file or directory)';
      const fd = op.call === 'dirfd' ? `5<${op.dirfdBase}>` : op.decor ? `AT_FDCWD<${cwd}>` : 'AT_FDCWD';
      let args: string;
      if (op.call === 'open') args = `${q(op.path)}, ${op.flags}`;
      else if (op.call === 'openat2') args = `${fd}, ${q(op.path)}, {flags=${op.flags}, resolve=RESOLVE_NO_SYMLINKS}, 24`;
      else args = `${fd}, ${q(op.path)}, ${op.flags}`;
      const name = op.call === 'open' ? 'open' : op.call === 'openat2' ? 'openat2' : 'openat';
      callLines(name, args, ret, op.split);
      const readsFile = op.flags.startsWith('O_RDONLY') || op.flags.startsWith('O_RDWR');
      const rel = underWork(abs);
      if (op.ok && readsFile && rel !== undefined && rel !== '' && isSecretName(rel.slice(rel.lastIndexOf('/') + 1))) {
        expected.add(`secret-read|${rel}`);
      }
    }
  }
  return lines;
}

function interleave(perPid: string[][], schedule: readonly number[]): string[] {
  const idx = perPid.map(() => 0);
  const out: string[] = [];
  let step = 0;
  for (;;) {
    const live = perPid.map((_, i) => i).filter((i) => idx[i]! < perPid[i]!.length);
    if (live.length === 0) return out;
    const pick = live[(schedule[step++ % schedule.length] ?? 0) % live.length]!;
    out.push(perPid[pick]![idx[pick]!++]!);
  }
}

function summarize(obs: readonly { kind: string; destination?: string; path?: string }[]): string[] {
  return obs.map((o) => `${o.kind}|${o.kind === 'network-attempt' ? o.destination : o.path}`).sort();
}

describe('Feature: ghost-runner, Property 13: strace parser extracts exactly the destinations and secret reads', () => {
  it(
    'extracts exactly the expected destinations and secret reads from interleaved logs',
    () => {
      fc.assert(
        fc.property(scenarioArb, (sc) => {
          const expected: Expected = new Set();
          const seed = sc.cwd === undefined ? '/work' : sc.cwd.startsWith('/') ? norm(sc.cwd) : join('/work', sc.cwd);
          const perPid = sc.scripts.map((s) => renderScript(s, seed, expected));
          const text = interleave(perPid, sc.schedule).join('\n') + (sc.trailingNewline ? '\n' : '');
          const res = parseStrace(text, {
            stepIndex: 3,
            ...(sc.cwd === undefined ? {} : { cwd: sc.cwd }),
            secretPatterns: DEFAULT_SECRET_PATTERNS,
            resolveLoopback,
          });
          expect(summarize(res.observations)).toEqual([...expected].sort());
          expect(res.observations.every((o) => o.stepIndex === 3)).toBe(true);
          for (const o of res.observations) {
            expect(o.source).toBe(o.kind === 'secret-read' ? 'strace-openat' : o.source);
          }
        }),
        pbtParams(),
      );
    },
    testTimeoutMs(false),
  );

  it(
    'never throws on arbitrary text, truncated logs, or hostile options',
    () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ unit: 'binary', maxLength: 400 }),
            fc.array(fc.string({ unit: 'grapheme-ascii', maxLength: 60 }), { maxLength: 10 }).map((l) => l.join('\n')),
            scenarioArb.chain((sc) => {
              const text = interleave(
                sc.scripts.map((s) => renderScript(s, '/work', new Set())),
                sc.schedule,
              ).join('\n');
              return fc.nat(Math.max(0, text.length)).map((n) => text.slice(0, n));
            }),
          ),
          fc.constantFrom<string | undefined>(undefined, '', '..', '/', '/work/../..', 'a\u0000b'),
          (text, cwd) => {
            const res = parseStrace(text, {
              stepIndex: 0,
              ...(cwd === undefined ? {} : { cwd }),
              secretPatterns: DEFAULT_SECRET_PATTERNS,
            });
            expect(Array.isArray(res.observations)).toBe(true);
            expect(res.ignoredLines).toBeGreaterThanOrEqual(0);
          },
        ),
        pbtParams(),
      );
    },
    testTimeoutMs(false),
  );

  it('ignores loopback connects when no resolver is supplied and records no payload bytes', () => {
    const line =
      '[pid 7] connect(3<socket:[1]>, {sa_family=AF_INET, sin_port=htons(80), sin_addr=inet_addr("127.0.0.2")}, 16) = 0\n' +
      '[pid 7] openat(AT_FDCWD, ".env", O_RDONLY) = 4</work/.env>\n';
    const res = parseStrace(line, { stepIndex: 1, secretPatterns: DEFAULT_SECRET_PATTERNS });
    expect(res.observations).toEqual([
      { kind: 'secret-read', stepIndex: 1, path: '.env', source: 'strace-openat' },
    ]);
  });
});
