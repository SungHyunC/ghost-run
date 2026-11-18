// [no-docker] No secret bytes on any output channel (task 12.9).
// Validates: Requirements 9.4, 9.11, 9.12, 9.13, 9.14, 18.6
//
// Kept aligned with Property 12 (tests/p12-no-payload-secret-bytes.test.ts): the same canary,
// the same 9-byte window (any contiguous run longer than 8 bytes), and the same four
// encodings (raw, base64, hex, URL). The only allowed exception is the in-memory
// `RunOutput.payloads` map of a captured network body; only its length and SHA-256 are serialized.
//
// ghost-runner has no logger and no graveyard output of its own, so those channels are
// covered by the console/stdout/stderr spies and the `onNotice` callback only.
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { runInNewContext } from 'node:vm';
import { setFlagsFromString } from 'node:v8';
import type { WardSet } from '@ghost-run/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPlan } from '../src/pipeline.js';
import { serializeRunResult, type RunOutput } from '../src/result.js';
import { cleanRecorderFiles, createFakeDocker } from './fixtures/fake-docker.js';

// -- file-system layer spy (records the bytes of every write call once armed) ------------
const rec = vi.hoisted(() => ({ on: false, writes: [] as Buffer[] }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const a = await importOriginal<typeof import('node:fs/promises')>();
  const note = (d: unknown): void => {
    if (!rec.on) return;
    if (typeof d === 'string') rec.writes.push(Buffer.from(d));
    else if (ArrayBuffer.isView(d)) rec.writes.push(Buffer.from(d.buffer, d.byteOffset, d.byteLength).subarray());
  };
  const wrapped: any = {
    ...a,
    writeFile: (p: any, d: any, o: any) => (note(d), (a.writeFile as any)(p, d, o)),
    appendFile: (p: any, d: any, o: any) => (note(d), (a.appendFile as any)(p, d, o)),
    open: async (...args: any[]) => {
      const h: any = await (a.open as any)(...args);
      for (const m of ['write', 'writeFile', 'appendFile']) {
        const orig = h[m]?.bind(h);
        if (orig) h[m] = (...x: any[]) => (note(x[0]), orig(...x));
      }
      return h;
    },
  };
  return { ...wrapped, default: wrapped };
});

vi.mock('node:fs', async (importOriginal) => {
  const a = await importOriginal<typeof import('node:fs')>();
  const note = (d: unknown): void => {
    if (!rec.on) return;
    if (typeof d === 'string') rec.writes.push(Buffer.from(d));
    else if (ArrayBuffer.isView(d)) rec.writes.push(Buffer.from(d.buffer, d.byteOffset, d.byteLength).subarray());
  };
  const wrapped: any = {
    ...a,
    writeFileSync: (p: any, d: any, o: any) => (note(d), (a.writeFileSync as any)(p, d, o)),
    appendFileSync: (p: any, d: any, o: any) => (note(d), (a.appendFileSync as any)(p, d, o)),
    writeSync: (fd: any, d: any, ...r: any[]) => (note(d), (a.writeSync as any)(fd, d, ...r)),
    createWriteStream: (...args: any[]) => {
      const s: any = (a.createWriteStream as any)(...args);
      const w = s.write.bind(s);
      s.write = (c: any, ...r: any[]) => (note(c), w(c, ...r));
      return s;
    },
  };
  return { ...wrapped, default: wrapped };
});

// -- fixture and needles --------------------------------------------------------------------
const CANARY = 'sk-CANARY-abc123';
const enc = new TextEncoder();
const dec = new TextDecoder();

/** `.env` content: filler lines in an alphabet no other output uses, plus the canary. */
const SECRET_TEXT = [
  'XQZJWV_ONE=QXZJWVQXZJWV0123',
  'XQZJWV_TWO=JWVQXZJWVQXZ4567',
  `API_TOKEN=${CANARY}`,
  'XQZJWV_THREE=ZJWVQXZJWVQX8901',
  '',
].join('\n');
const SECRET_BYTES = Uint8Array.from(Buffer.from(SECRET_TEXT));

/** Same construction as Property 12: canary plus every 9-byte window, in four encodings. */
function needles(content: Uint8Array): string[] {
  const out = new Set<string>([CANARY]);
  const forms = (b: Uint8Array): void => {
    out.add(dec.decode(b));
    out.add(Buffer.from(b).toString('base64').replace(/=+$/, ''));
    out.add(Buffer.from(b).toString('hex'));
    out.add([...b].map((x) => '%' + x.toString(16).padStart(2, '0')).join(''));
    out.add(encodeURIComponent(dec.decode(b)));
  };
  forms(Uint8Array.from(Buffer.from(CANARY)));
  for (let i = 0; i + 9 <= content.length; i++) forms(content.subarray(i, i + 9));
  return [...out].filter((n) => n.length > 0 && !/^[a-z0-9]{0,8}$/.test(n));
}
const NEEDLES = needles(SECRET_BYTES);

const leaks = (haystack: string | Buffer): string[] => {
  const buf = typeof haystack === 'string' ? Buffer.from(haystack) : haystack;
  return NEEDLES.filter((n) => buf.includes(Buffer.from(n)));
};

const egress = (secrets: string[]): WardSet => ({
  wards: [{ id: 'no-exfil', kind: 'egress', secrets, allow_hosts: [] }],
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  rec.on = false;
  rec.writes.length = 0;
  for (const c of cleanups.splice(0).reverse()) c();
});

function makeDir(prefix: string): string {
  const d = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  cleanups.push(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

function walkFiles(root: string, skip: string | undefined, out: { path: string; bytes: Buffer }[]): void {
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    if (p === skip) continue;
    const st = lstatSync(p);
    if (st.isDirectory()) walkFiles(p, skip, out);
    else if (st.isFile()) out.push({ path: p, bytes: readFileSync(p) });
    else out.push({ path: p, bytes: Buffer.alloc(0) });
  }
}

interface Scenario {
  readonly output: RunOutput;
  /** Named text channels, each checked for leaks. */
  readonly channels: Record<string, string>;
  /** Files seen outside the Copy (during the step and left over after the run). */
  readonly outside: { path: string; bytes: Buffer }[];
  readonly notices: string[];
  readonly weak: { maps: WeakRef<Map<unknown, unknown>>[]; arrays: WeakRef<Uint8Array>[] };
}

async function scenario(opts: { unreadable?: boolean; payload?: boolean; armFs?: boolean }): Promise<Scenario> {
  const original = makeDir('ghost-noleak-orig-');
  writeFileSync(join(original, 'seed.txt'), 'seed\n');
  writeFileSync(join(original, '.env'), SECRET_TEXT);
  if (opts.unreadable) symlinkSync('missing.example', join(original, 'link.key'));
  const scratch = makeDir('ghost-noleak-scratch-');

  const body = Buffer.from(SECRET_BYTES);
  const httpLine = JSON.stringify({
    host: 'collect.example',
    port: 80,
    step: 0,
    bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
    body: body.toString('base64'),
  });
  const files = cleanRecorderFiles(1, opts.payload ? { 'http.jsonl': `${httpLine}\n` } : {});

  const outside: { path: string; bytes: Buffer }[] = [];
  const client = createFakeDocker({
    recorder: { files },
    onStep: ({ copyDir }) => {
      walkFiles(scratch, copyDir, outside);
    },
  });

  // Console, stdout and stderr spies.
  const logged: string[] = [];
  const spies: { mockRestore(): void }[] = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logged.push(inspect(a, { depth: 8 }))));
  }
  for (const s of [process.stdout, process.stderr]) {
    spies.push(vi.spyOn(s, 'write').mockImplementation(((c: unknown) => (logged.push(String(c)), true)) as never));
  }

  // Capture the secretValues map and its arrays weakly (set of a `.env` key with bytes).
  const weak: Scenario['weak'] = { maps: [], arrays: [] };
  const origSet = Map.prototype.set;
  Map.prototype.set = function (this: Map<unknown, unknown>, k: unknown, v: unknown) {
    if (k === '.env' && v instanceof Uint8Array) {
      weak.maps.push(new WeakRef(this));
      weak.arrays.push(new WeakRef(v));
    }
    return origSet.call(this, k, v);
  } as typeof Map.prototype.set;

  const prevTmp = process.env['TMPDIR'];
  process.env['TMPDIR'] = scratch;
  const notices: string[] = [];
  let output: RunOutput;
  try {
    if (opts.armFs) {
      rec.writes.length = 0;
      rec.on = true;
    }
    output = await runPlan([{ command: 'true' }], {
      original,
      client,
      wardSet: egress(opts.unreadable ? ['.env', '*.key'] : ['.env']),
      onNotice: (n) => notices.push(n),
    });
  } finally {
    rec.on = false;
    Map.prototype.set = origSet;
    if (prevTmp === undefined) delete process.env['TMPDIR'];
    else process.env['TMPDIR'] = prevTmp;
    for (const s of spies) s.mockRestore();
  }
  walkFiles(scratch, undefined, outside);

  const { result } = output;
  const channels: Record<string, string> = {
    serializedRunResult: serializeRunResult(result),
    jsonRunResult: JSON.stringify(result),
    report: JSON.stringify(result.report),
    wardVerdict: JSON.stringify(result.wardVerdict ?? null),
    diagnostics: JSON.stringify(result.diagnostics),
    notices: JSON.stringify(notices) + JSON.stringify(result.notices),
    captures: JSON.stringify(result.captures),
    consoleAndStreams: logged.join('\n'),
    outsidePaths: outside.map((f) => f.path).join('\n'),
  };
  return { output, channels, outside, notices, weak };
}

describe('no secret bytes on any output channel', () => {
  it('serialized RunResult, report, WardVerdict, console/stream output and files outside the Copy are clean', async () => {
    const s = await scenario({ payload: true });
    for (const [name, text] of Object.entries(s.channels)) expect(leaks(text), name).toEqual([]);
    expect(s.outside.length).toBeGreaterThan(0); // the sentinel file was seen
    for (const f of s.outside) expect(leaks(f.bytes), f.path).toEqual([]);
    expect(s.output.result.wardVerdict).toBeDefined();
  });

  it('serializes only length and SHA-256 of the captured network payload; the bytes stay in memory', async () => {
    const s = await scenario({ payload: true });
    const { result, payloads } = s.output;
    expect(result.captures).toHaveLength(1);
    const cap = result.captures[0] as { eventId: string; byteLength: number; sha256: string };
    expect(Object.keys(cap).sort()).toEqual(['byteLength', 'eventId', 'sha256']);
    expect(cap.byteLength).toBe(SECRET_BYTES.length);
    expect(cap.sha256).toBe(createHash('sha256').update(SECRET_BYTES).digest('hex'));
    // The in-memory payload is the single allowed exception.
    expect(Buffer.from(payloads.get(cap.eventId) as Uint8Array).toString()).toBe(SECRET_TEXT);
    expect(leaks(s.channels['serializedRunResult'] as string)).toEqual([]);
  });

  it('never hands bytes containing a window of the secret to a file-system write', async () => {
    const s = await scenario({ payload: true, armFs: true });
    expect(s.output.result.status).toBe('ok');
    expect(rec.writes.length).toBeGreaterThan(0); // spy is live (sentinel write at least)
    for (const w of rec.writes) expect(leaks(w)).toEqual([]);
  });

  it('spy control: a write of secret bytes through the wrapped layer is detected', async () => {
    const fsp = await import('node:fs/promises');
    const dir = makeDir('ghost-noleak-ctl-');
    rec.writes.length = 0;
    rec.on = true;
    await fsp.writeFile(join(dir, 'x'), SECRET_BYTES);
    rec.on = false;
    expect(rec.writes.some((w) => leaks(w).length > 0)).toBe(true);
  });
});

describe('RunOutput and RunResult hold no reference to secretValues', () => {
  /** Structural walk. Returns true when any target object is reachable, or secret bytes outside `payloads`. */
  function reaches(root: unknown, targets: Set<object>, skipKey: string | undefined): string | undefined {
    const seen = new Set<object>();
    const stack: { v: unknown; path: string }[] = [{ v: root, path: '$' }];
    while (stack.length > 0) {
      const { v, path } = stack.pop() as { v: unknown; path: string };
      if (typeof v !== 'object' || v === null || seen.has(v)) continue;
      seen.add(v);
      if (targets.has(v)) return path;
      if (ArrayBuffer.isView(v)) {
        if (leaks(Buffer.from(v.buffer, v.byteOffset, v.byteLength)).length > 0) return `${path} (secret bytes)`;
        continue;
      }
      if (v instanceof Map) {
        for (const [k, x] of v) stack.push({ v: k, path: `${path}.key` }, { v: x, path: `${path}[${String(k)}]` });
      } else if (v instanceof Set) {
        for (const x of v) stack.push({ v: x, path: `${path}.item` });
      } else {
        for (const [k, x] of Object.entries(v)) {
          if (k === skipKey) continue;
          stack.push({ v: x, path: `${path}.${k}` });
        }
      }
    }
    return undefined;
  }

  function forceGc(): (() => void) | undefined {
    if (typeof (globalThis as any).gc === 'function') return (globalThis as any).gc;
    try {
      setFlagsFromString('--expose-gc');
      return runInNewContext('gc') as () => void;
    } catch {
      return undefined;
    }
  }

  it('returned objects do not reach the map or its arrays, and both are collected after the run', async () => {
    const s = await scenario({ payload: true });
    expect(s.weak.maps.length).toBeGreaterThan(0);

    // Synchronous section: deref keeps targets alive until the end of the job.
    (() => {
      const targets = new Set<object>();
      for (const r of s.weak.maps) {
        const m = r.deref();
        if (m !== undefined) {
          targets.add(m);
          expect(m.size).toBe(0); // cleared after evaluation
        }
      }
      for (const r of s.weak.arrays) {
        const a = r.deref();
        if (a !== undefined) targets.add(a);
      }
      // Walk everything returned; the `payloads` map is the allowed holder of captured body bytes.
      expect(reaches(s.output, targets, 'payloads')).toBeUndefined();
      // The payloads map itself must not contain the secretValues map or arrays either.
      expect(reaches(s.output.payloads, targets, undefined)?.includes('secret bytes') ?? false).toBe(true); // control: body is held there
      const asMap = new Map([...s.output.payloads]);
      for (const t of targets) expect([...asMap.values()].includes(t as Uint8Array)).toBe(false);
      expect('secretValues' in s.output.result).toBe(false);
      expect('secretValues' in s.output).toBe(false);
    })();

    const gc = forceGc();
    if (gc === undefined) return; // no gc available: the structural walk above still ran
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 10));
      gc();
    }
    expect(s.weak.maps.map((r) => r.deref())).toEqual(s.weak.maps.map(() => undefined));
    expect(s.weak.arrays.map((r) => r.deref())).toEqual(s.weak.arrays.map(() => undefined));
  });
});

describe('unreadable secret file', () => {
  it('reports secret-values-unreadable with the path only, drops the P6 claim, gives at least warn, and leaks nothing', async () => {
    const s = await scenario({ unreadable: true });
    const { result } = s.output;
    const d = result.diagnostics.filter((x) => x.name === 'secret-values-unreadable');
    expect(d).toEqual([{ name: 'secret-values-unreadable', path: 'link.key' }]);
    expect(result.isolation.p6Claimed).toBe(false);
    expect(['warn', 'block']).toContain(result.verdict);
    for (const [name, text] of Object.entries(s.channels)) expect(leaks(text), name).toEqual([]);
    for (const f of s.outside) expect(leaks(f.bytes), f.path).toEqual([]);
  });
});
