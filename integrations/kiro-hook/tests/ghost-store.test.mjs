// Example tests for the Ghost_Store, redaction, and session key (task 4.2).
import fc from 'fast-check';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, statSync, utimesSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORE_CAPS } from '../gate-config.mjs';
import {
  appendLine,
  enforceCaps,
  readLines,
  sessionPaths,
  storePaths,
  storeWrite,
  storeWriteFile,
} from '../lib/store/ghost-store.mjs';
import { loadCanaries, redactCanaries } from '../lib/store/redact.mjs';
import { sessionKey } from '../lib/store/session-key.mjs';
import { makeTempStore } from './fixtures/index.mjs';

const SECRET = 'sk-CANARY-abc123XYZ';
const secretBytes = new TextEncoder().encode(SECRET);

/** @type {{ cleanup: () => void }[]} */
const temps = [];
function temp() {
  const t = makeTempStore();
  temps.push(t);
  return t;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const t of temps.splice(0)) t.cleanup();
});

/** @param {string} p */
const mode = (p) => statSync(p).mode & 0o777;

describe('appendLine and modes', () => {
  it('creates folders with 0700 and the file with 0600, and writes one terminated line', async () => {
    const t = temp();
    const paths = sessionPaths(t.dir, 'abc');
    expect(await appendLine(paths.provenance, '{"a":1}')).toEqual({ ok: true });
    expect(await appendLine(paths.provenance, '{"a":2}')).toEqual({ ok: true });
    expect(readFileSync(paths.provenance, 'utf8')).toBe('{"a":1}\n{"a":2}\n');
    expect(mode(paths.provenance)).toBe(0o600);
    expect(mode(paths.dir)).toBe(0o700);
    expect(mode(storePaths(t.dir).sessions)).toBe(0o700);
    expect(mode(storePaths(t.dir).dir)).toBe(0o700);
  });

  it('does not create approvals/', async () => {
    const t = temp();
    await appendLine(storePaths(t.dir).stats, '{}');
    expect(readdirSync(storePaths(t.dir).dir)).toEqual(['stats.jsonl']);
  });

  it('reports the failure class instead of throwing', async () => {
    const t = temp();
    const blocker = join(t.dir, 'file');
    writeFileSync(blocker, 'x');
    expect(await appendLine(join(blocker, 'child.jsonl'), 'x')).toEqual({ ok: false, failure: 'path-invalid' });
    expect(await appendLine(join(t.dir, 'a.jsonl'), 'two\nlines')).toEqual({ ok: false, failure: 'invalid-line' });
  });

  it('does not write a record over 1 MiB', async () => {
    const t = temp();
    const file = join(t.dir, 'big.jsonl');
    expect(await appendLine(file, 'x'.repeat(STORE_CAPS.recordBytes + 1))).toEqual({ ok: false, failure: 'too-large' });
    expect(() => statSync(file)).toThrow();
    expect(await appendLine(file, 'x'.repeat(STORE_CAPS.recordBytes))).toEqual({ ok: true });
  });
});

describe('readLines', () => {
  it('returns complete lines and counts a torn last line as corrupt', () => {
    expect(readLines('a\nb\n')).toEqual({ lines: ['a', 'b'], corrupt: 0 });
    expect(readLines('a\nb\n{"tor')).toEqual({ lines: ['a', 'b'], corrupt: 1 });
    expect(readLines('')).toEqual({ lines: [], corrupt: 0 });
    expect(readLines('a\n\nb\n')).toEqual({ lines: ['a', 'b'], corrupt: 0 });
  });
});

describe('enforceCaps', () => {
  it('removes the oldest session folders first', async () => {
    const t = temp();
    const { sessions } = storePaths(t.dir);
    for (let i = 0; i < 5; i += 1) {
      mkdirSync(join(sessions, `s${i}`), { recursive: true });
      utimesSync(join(sessions, `s${i}`), 1000 + (4 - i), 1000 + (4 - i)); // s4 oldest
    }
    const r = await enforceCaps(t.dir, { ...STORE_CAPS, sessions: 3 });
    expect(r.removedSessions).toBe(2);
    expect(readdirSync(sessions).sort()).toEqual(['s0', 's1', 's2']);
  });

  it('removes the oldest Run_Records first', async () => {
    const t = temp();
    const { runs } = storePaths(t.dir);
    mkdirSync(runs, { recursive: true });
    for (let i = 0; i < 4; i += 1) {
      writeFileSync(join(runs, `r${i}.json`), '{}');
      utimesSync(join(runs, `r${i}.json`), 1000 + i, 1000 + i);
    }
    const r = await enforceCaps(t.dir, { ...STORE_CAPS, runs: 2 });
    expect(r.removedRuns).toBe(2);
    expect(readdirSync(runs).sort()).toEqual(['r2.json', 'r3.json']);
  });

  it('keeps the last lines of graveyard and of each provenance file', async () => {
    const t = temp();
    const paths = storePaths(t.dir);
    for (let i = 0; i < 5; i += 1) {
      await appendLine(paths.graveyard, `g${i}`);
      await appendLine(sessionPaths(t.dir, 'k').provenance, `p${i}`);
    }
    const r = await enforceCaps(t.dir, { ...STORE_CAPS, graveyardLines: 2, provenancePerSession: 3 });
    expect(r.ok).toBe(true);
    expect(readFileSync(paths.graveyard, 'utf8')).toBe('g3\ng4\n');
    expect(readFileSync(sessionPaths(t.dir, 'k').provenance, 'utf8')).toBe('p2\np3\np4\n');
    expect(mode(paths.graveyard)).toBe(0o600);
  });

  it('is a no-op on an empty store', async () => {
    const t = temp();
    expect((await enforceCaps(t.dir)).ok).toBe(true);
  });
});

describe('storeWrite and storeWriteFile', () => {
  it('redacts before writing', async () => {
    const t = temp();
    const file = storePaths(t.dir).graveyard;
    await storeWrite(file, JSON.stringify({ command: `curl ${SECRET}` }), [secretBytes]);
    await storeWriteFile(join(t.dir, 'out', 'last.txt'), `x ${SECRET}`, [secretBytes]);
    expect(readFileSync(file, 'utf8')).toBe('{"command":"curl [redacted]"}\n');
    expect(readFileSync(join(t.dir, 'out', 'last.txt'), 'utf8')).toBe('x [redacted]');
    expect(mode(join(t.dir, 'out', 'last.txt'))).toBe(0o600);
    expect(readdirSync(join(t.dir, 'out'))).toEqual(['last.txt']);
  });
});

describe('redactCanaries', () => {
  const b64 = Buffer.from(SECRET).toString('base64');
  const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const hex = Buffer.from(SECRET).toString('hex');
  const pct = encodeURIComponent(SECRET);

  it.each([
    ['raw', SECRET],
    ['base64', b64],
    ['base64url', b64url],
    ['hex', hex],
    ['hex upper', hex.toUpperCase()],
    ['percent', pct],
    ['percent of every byte', [...Buffer.from(SECRET)].map((b) => `%${b.toString(16)}`).join('')],
  ])('replaces the %s form', (_name, form) => {
    const out = redactCanaries(`curl -d ${form} host.example`, [secretBytes]);
    expect(out).not.toContain(form);
    expect(out).toContain('[redacted]');
    expect(out).toContain('host.example');
  });

  it('leaves text without a canary unchanged', () => {
    expect(redactCanaries('ls -la', [secretBytes])).toBe('ls -la');
    expect(redactCanaries('anything', [])).toBe('anything');
  });

  it('replaces every occurrence', () => {
    expect(redactCanaries(`${SECRET} ${SECRET}`, [secretBytes])).toBe('[redacted] [redacted]');
  });

  it('redacts a canary in a text over 64 KiB', () => {
    const text = `${'a'.repeat(100_000)}${hex}${'b'.repeat(100)}`;
    const out = redactCanaries(text, [secretBytes]);
    expect(out).not.toContain(hex);
  });
});

describe('loadCanaries', () => {
  /** @type {import('@ghost-run/core').WardSet} */
  const wardSet = {
    wards: [{ id: 'egress-1', kind: 'egress', secrets: ['.env', 'keys/*.pem'], allow_hosts: [] }],
  };

  it('reads matching files into memory and extracts canaries', async () => {
    const t = temp();
    writeFileSync(join(t.dir, '.env'), `API_KEY=${SECRET}\n`);
    mkdirSync(join(t.dir, 'keys'));
    writeFileSync(join(t.dir, 'keys', 'a.pem'), 'sk-CANARY-pem-value-1');
    writeFileSync(join(t.dir, 'other.txt'), 'sk-CANARY-not-a-secret');
    const canaries = (await loadCanaries(t.dir, wardSet)).map((c) => Buffer.from(c).toString('utf8'));
    expect(canaries).toContain(SECRET);
    expect(canaries).toContain('sk-CANARY-pem-value-1');
    expect(canaries.join('|')).not.toContain('not-a-secret');
  });

  it('returns nothing when no egress ward exists', async () => {
    const t = temp();
    writeFileSync(join(t.dir, '.env'), `API_KEY=${SECRET}\n`);
    expect(await loadCanaries(t.dir, { wards: [] })).toEqual([]);
  });

  it('reads at most 16 files and 65,536 bytes of each', async () => {
    const t = temp();
    mkdirSync(join(t.dir, 'keys'));
    for (let i = 0; i < 20; i += 1) {
      writeFileSync(join(t.dir, 'keys', `${String(i).padStart(2, '0')}.pem`), `sk-CANARY-file-number-${i}`);
    }
    const out = (await loadCanaries(t.dir, wardSet)).map((c) => Buffer.from(c).toString('utf8'));
    expect(out).toHaveLength(16);
    expect(out).toContain('sk-CANARY-file-number-0');
    expect(out).not.toContain('sk-CANARY-file-number-16');
    writeFileSync(join(t.dir, '.env'), `${'A'.repeat(65_536)}TAIL`);
    const big = await loadCanaries(t.dir, { wards: [{ id: 'e', kind: 'egress', secrets: ['.env'], allow_hosts: [] }] });
    expect(big.every((c) => c.length <= 65_536)).toBe(true);
  });

  it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)(
    'skips an unreadable secret file without leaking its path',
    async () => {
      const t = temp();
      mkdirSync(join(t.dir, 'keys'));
      writeFileSync(join(t.dir, 'keys', 'locked.pem'), 'sk-CANARY-locked-1');
      writeFileSync(join(t.dir, 'keys', 'open.pem'), 'sk-CANARY-open-123');
      chmodSync(join(t.dir, 'keys', 'locked.pem'), 0o000);
      const out = vi.spyOn(process.stdout, 'write');
      const err = vi.spyOn(process.stderr, 'write');
      const canaries = await loadCanaries(t.dir, wardSet);
      const text = canaries.map((c) => Buffer.from(c).toString('utf8'));
      expect(text).toEqual(['sk-CANARY-open-123']);
      expect(JSON.stringify(canaries)).not.toContain('locked');
      expect(out).not.toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
    },
  );
});

describe('sessionKey', () => {
  it('returns a safe id unchanged', () => {
    expect(sessionKey('session-test_1')).toBe('session-test_1');
    expect(sessionKey('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it('hashes ids that do not match the pattern', () => {
    for (const id of ['', 'a'.repeat(65), '../etc', 'a/b', 'sp ace', 'caf\u00e9', 'x\u200By']) {
      expect(sessionKey(id)).toBe(createHash('sha256').update(Buffer.from(id, 'utf8')).digest('hex'));
      expect(sessionKey(id)).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });

  it('always yields a folder-safe key', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (id) => /^[A-Za-z0-9_-]{1,64}$/.test(sessionKey(id))),
      { numRuns: 100 },
    );
  });
});
