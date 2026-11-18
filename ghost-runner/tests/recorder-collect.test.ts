import { describe, expect, it } from 'vitest';
import type { DockerClient, DockerResult } from '../src/docker/cli.js';
import { collectRecorder, readTar } from '../src/recorder/collect.js';

interface Entry {
  readonly name: string;
  readonly body?: string | Buffer;
  readonly type?: string;
  readonly pax?: Readonly<Record<string, string>>;
}

function header(name: string, size: number, type: string): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  h.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

function pad(b: Buffer): Buffer {
  const rem = b.length % 512;
  return rem === 0 ? b : Buffer.concat([b, Buffer.alloc(512 - rem)]);
}

function paxBody(records: Readonly<Record<string, string>>): Buffer {
  let s = '';
  for (const [k, v] of Object.entries(records)) {
    const rest = ` ${k}=${v}\n`;
    let len = rest.length + 1;
    while (`${len}${rest}`.length !== len) len = `${len}${rest}`.length;
    s += `${len}${rest}`;
  }
  return Buffer.from(s, 'utf8');
}

function tar(entries: readonly Entry[], end = true): Buffer {
  const parts: Buffer[] = [header('ghost-rec/', 0, '5')];
  for (const e of entries) {
    if (e.pax) {
      const pb = paxBody(e.pax);
      parts.push(header('PaxHeader/x', pb.length, 'x'), pad(pb));
    }
    const body = Buffer.from(e.body ?? '');
    parts.push(header(e.name, body.length, e.type ?? '0'), pad(body));
  }
  if (end) parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

function client(stdout: Buffer, code: number | null = 0): DockerClient & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    run(args) {
      calls.push([...args]);
      const r: DockerResult = { code, stdout, stderr: Buffer.alloc(0), timedOut: false };
      return Promise.resolve(r);
    },
  };
}

const PATTERNS = ['.env'];
const marker = (i: number, probe = true): string => JSON.stringify({ end: i, exit: 0, probe });
const READ_ENV = '12 openat(AT_FDCWD, "/work/.env", O_RDONLY) = 3</work/.env>\n';

function goodEntries(): Entry[] {
  return [
    { name: 'ghost-rec/step-0.strace', body: READ_ENV },
    { name: 'ghost-rec/step-1.strace', body: '' },
    { name: 'ghost-rec/steps.jsonl', body: `${marker(0)}\n${marker(1)}\n` },
    { name: 'ghost-rec/dns.jsonl', body: '{"host":"Exfil.Example","ip":"127.0.0.2","step":1}\n' },
  ];
}

describe('readTar', () => {
  it('reads regular files under ghost-rec/ and honors PAX path and size', () => {
    const r = readTar(
      tar([
        { name: 'ghost-rec/a.txt', body: 'hello' },
        { name: 'ghost-rec/ignored-name', body: 'world', pax: { path: 'ghost-rec/b.txt', mtime: '1.5' } },
      ]),
      { maxTotalBytes: 1024, maxEntryBytes: 1024 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.files.keys()].sort()).toEqual(['a.txt', 'b.txt']);
    expect(r.files.get('b.txt')?.toString()).toBe('world');
  });

  it.each([
    ['path traversal', { name: 'ghost-rec/../etc/passwd' }],
    ['nested path', { name: 'ghost-rec/sub/file' }],
    ['hidden entry', { name: 'ghost-rec/._steps.jsonl' }],
    ['outside ghost-rec', { name: 'other/file' }],
    ['symlink', { name: 'ghost-rec/link', type: '2' }],
    ['traversal via PAX path', { name: 'ghost-rec/ok', pax: { path: '../escape' } }],
  ])('rejects %s', (_label, entry: Entry) => {
    const r = readTar(tar([entry]), { maxTotalBytes: 1024, maxEntryBytes: 1024 });
    expect(r).toMatchObject({ ok: false, reason: 'tar-invalid' });
  });

  it('rejects oversized entries and totals over the cap', () => {
    const big = { name: 'ghost-rec/a', body: 'x'.repeat(600) };
    expect(readTar(tar([big]), { maxTotalBytes: 10_000, maxEntryBytes: 500 })).toMatchObject({ reason: 'over-cap' });
    const two = [big, { ...big, name: 'ghost-rec/b' }];
    expect(readTar(tar(two), { maxTotalBytes: 1000, maxEntryBytes: 1000 })).toMatchObject({ reason: 'over-cap' });
  });

  it('rejects a truncated archive and a bad checksum', () => {
    const t = tar(goodEntries(), false);
    expect(readTar(t, { maxTotalBytes: 1e6, maxEntryBytes: 1e6 })).toMatchObject({ ok: false, reason: 'tar-invalid' });
    const c = tar(goodEntries());
    c[20] = 0x41; // change a header byte without fixing the checksum
    expect(readTar(c, { maxTotalBytes: 1e6, maxEntryBytes: 1e6 })).toMatchObject({
      ok: false,
      detail: 'checksum mismatch',
    });
  });
});

describe('collectRecorder', () => {
  it('parses valid output into events with no diagnostics and reports the in-box recorder', async () => {
    const c = client(tar(goodEntries()));
    const r = await collectRecorder(c, 'ghost-abc', { executedSteps: 2, secretPatterns: PATTERNS });
    expect(c.calls).toEqual([['cp', 'ghost-abc:/ghost-rec', '-']]);
    expect(r.diagnostics).toEqual([]);
    expect(r.recorderOk).toBe(true);
    expect(r.recorder).toEqual({ location: 'in-box', tamperResistant: false });
    expect(r.events).toEqual(
      expect.arrayContaining([
        { kind: 'secret-read', path: '.env', stepIndex: 0 },
        { kind: 'network-attempt', destination: 'exfil.example', stepIndex: 1 },
      ]),
    );
  });

  const mutations: [string, (e: Entry[]) => Entry[]][] = [
    ['missing step file', (e) => e.filter((x) => x.name !== 'ghost-rec/step-1.strace')],
    ['missing end marker', (e) => e.map((x) => (x.name.endsWith('steps.jsonl') ? { ...x, body: marker(0) } : x))],
    ['failed liveness probe', (e) => e.map((x) => (x.name.endsWith('steps.jsonl') ? { ...x, body: `${marker(0)}\n${marker(1, false)}` } : x))],
    ['unparseable marker line', (e) => e.map((x) => (x.name.endsWith('steps.jsonl') ? { ...x, body: `${marker(0)}\n${marker(1)}\n{"end":` } : x))],
    ['unparseable dns line', (e) => e.map((x) => (x.name.endsWith('dns.jsonl') ? { ...x, body: 'not json\n' } : x))],
    ['hidden entry', (e) => [...e, { name: 'ghost-rec/.hidden', body: '' }]],
  ];

  it.each(mutations)('reports recorder-failure for %s', async (_label, mutate) => {
    const r = await collectRecorder(client(tar(mutate(goodEntries()))), 'c', {
      executedSteps: 2,
      secretPatterns: PATTERNS,
    });
    expect(r.recorderOk).toBe(false);
    expect(r.diagnostics.some((d) => d.name === 'recorder-failure')).toBe(true);
    expect(r.recorder).toEqual({ location: 'in-box', tamperResistant: false });
  });

  it('reports recorder-failure when docker cp fails or the output exceeds the cap', async () => {
    const failedCp = await collectRecorder(client(Buffer.alloc(0), 1), 'c', { executedSteps: 1, secretPatterns: PATTERNS });
    expect(failedCp.diagnostics).toEqual([{ name: 'recorder-failure', detail: { reason: 'cp-failed' } }]);
    const over = await collectRecorder(client(tar(goodEntries())), 'c', {
      executedSteps: 2,
      secretPatterns: PATTERNS,
      maxBytes: 16,
    });
    expect(over.diagnostics).toEqual([{ name: 'recorder-failure', detail: { reason: 'over-cap' } }]);
  });
});
