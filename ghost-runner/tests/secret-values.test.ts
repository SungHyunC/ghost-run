// [no-docker] secretValues read from the Copy: selection, caps, diagnostics, release.
// Validates: Requirements 9.1, 9.4, 9.9, 9.10, 9.11, 9.12, 9.13, 9.15, 14.2
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WardSet } from '@ghost-run/core';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_SECRET_FILE_BYTES, MAX_SECRET_FILES } from '../src/config.js';
import { loadSecretValues, runPlan } from '../src/pipeline.js';
import type { Diagnostic } from '../src/result.js';
import { createFakeDocker } from './fixtures/fake-docker.js';

const CANARY = 'sk-CANARY-abc123';
const dirs: string[] = [];

function dir(): string {
  const d = mkdtempSync(join(tmpdir(), 'ghost-secretvalues-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const egress = (secrets: string[]): WardSet => ({
  wards: [{ id: 'no-exfil', kind: 'egress', secrets, allow_hosts: [] }],
});

const text = (b: Uint8Array): string => Buffer.from(b).toString('utf8');

describe('loadSecretValues', () => {
  it('returns undefined without an egress ward', async () => {
    const root = dir();
    writeFileSync(join(root, '.env'), CANARY);
    const diags: Diagnostic[] = [];
    expect(await loadSecretValues(root, { wards: [] }, [], diags)).toBeUndefined();
    expect(diags).toEqual([]);
  });

  it('reads only files selected by egress secrets, keyed by Copy-relative path', async () => {
    const root = dir();
    mkdirSync(join(root, 'cfg'));
    writeFileSync(join(root, '.env'), CANARY); // default pattern, not an egress secret
    writeFileSync(join(root, 'cfg', 'token.txt'), CANARY);
    writeFileSync(join(root, 'other.txt'), 'x');
    const diags: Diagnostic[] = [];
    const map = await loadSecretValues(root, egress(['cfg/token.txt']), [], diags);
    expect([...(map?.keys() ?? [])]).toEqual(['cfg/token.txt']);
    expect(text(map?.get('cfg/token.txt') as Uint8Array)).toBe(CANARY);
    expect(diags).toEqual([]);
  });

  it('reads the first 16 files in byte order and flags the rest with a count diagnostic', async () => {
    const root = dir();
    for (let i = 0; i < 18; i++) writeFileSync(join(root, `s${String(i).padStart(2, '0')}.key`), `v${String(i)}`);
    const diags: Diagnostic[] = [];
    const map = await loadSecretValues(root, egress(['*.key']), [], diags);
    expect(map?.size).toBe(MAX_SECRET_FILES);
    expect(map?.has('s15.key')).toBe(true);
    expect(map?.has('s16.key')).toBe(false);
    expect(diags).toEqual([
      { name: 'secret-values-capped', path: 's16.key', detail: { reason: 'count', byteLength: 3, cap: 16 } },
      { name: 'secret-values-capped', path: 's17.key', detail: { reason: 'count', byteLength: 3, cap: 16 } },
    ]);
  });

  it('truncates a file over 65,536 bytes and leaves an exactly 65,536-byte file alone', async () => {
    const root = dir();
    writeFileSync(join(root, 'a.key'), Buffer.alloc(MAX_SECRET_FILE_BYTES, 0x61));
    writeFileSync(join(root, 'b.key'), Buffer.concat([Buffer.alloc(MAX_SECRET_FILE_BYTES, 0x62), Buffer.from(CANARY)]));
    const diags: Diagnostic[] = [];
    const map = await loadSecretValues(root, egress(['*.key']), [], diags);
    expect(map?.get('a.key')?.length).toBe(MAX_SECRET_FILE_BYTES);
    expect(map?.get('b.key')?.length).toBe(MAX_SECRET_FILE_BYTES);
    expect(text(map?.get('b.key') as Uint8Array)).not.toContain('CANARY');
    expect(diags).toEqual([
      {
        name: 'secret-values-capped',
        path: 'b.key',
        detail: { reason: 'size', byteLength: MAX_SECRET_FILE_BYTES + CANARY.length, cap: MAX_SECRET_FILE_BYTES },
      },
    ]);
  });

  it('reports an unreadable match (symbolic link) with its path only', async () => {
    const root = dir();
    symlinkSync('missing.example', join(root, 'link.key'));
    const diags: Diagnostic[] = [];
    const map = await loadSecretValues(root, egress(['*.key']), [], diags);
    expect(map?.size).toBe(0);
    expect(diags).toEqual([{ name: 'secret-values-unreadable', path: 'link.key' }]);
  });
});

describe('runPlan secretValues handling', () => {
  it('gives at least warn and drops the P6 claim when a matching file is unreadable', async () => {
    const original = dir();
    writeFileSync(join(original, 'seed.txt'), 'seed\n');
    symlinkSync('missing.example', join(original, 'link.key'));
    const client = createFakeDocker({});
    const { result } = await runPlan([{ command: 'true' }], {
      original,
      client,
      wardSet: egress(['*.key']),
    });
    expect(result.diagnostics).toContainEqual({ name: 'secret-values-unreadable', path: 'link.key' });
    expect(result.isolation.p6Claimed).toBe(false);
    expect(result.verdict).not.toBe('pass');
    expect('secretValues' in result).toBe(false);
  });

  it('never puts file content into the serialized RunResult or the payloads', async () => {
    const original = dir();
    writeFileSync(join(original, 'seed.txt'), 'seed\n');
    writeFileSync(join(original, 'token.key'), CANARY);
    const client = createFakeDocker({});
    const { result, payloads } = await runPlan([{ command: 'true' }], {
      original,
      client,
      wardSet: egress(['*.key']),
    });
    expect(JSON.stringify(result)).not.toContain(CANARY);
    expect(payloads.size).toBe(0);
  });
});
