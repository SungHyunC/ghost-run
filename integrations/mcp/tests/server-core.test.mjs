import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { confinePath } from '../src/confine.mjs';
import { MAX_RESULT_BYTES, TRUNCATED_MARKER, makeResult, truncateText } from '../src/result.mjs';
import { TOOL_NAMES, parseInput } from '../src/schemas.mjs';
import { cutCommand } from '../src/tool-kit.mjs';
import { createServer } from '../src/server.mjs';

describe('schemas', () => {
  it('accepts a valid plan and rejects empty, oversized, and malformed plans', () => {
    expect(parseInput('ghost_run', { plan: [{ command: 'ls' }] }).ok).toBe(true);
    expect(parseInput('ghost_run', { plan: [] }).ok).toBe(false);
    expect(parseInput('ghost_run', { plan: Array.from({ length: 51 }, () => ({ command: 'ls' })) }).ok).toBe(false);
    expect(parseInput('ghost_run', { plan: [{ command: '' }] }).ok).toBe(false);
  });
  it('counts command length in code points', () => {
    const emoji = '\u{1F47B}'.repeat(4096);
    expect(parseInput('wards_check', { plan: [{ command: emoji }] }).ok).toBe(true);
    expect(parseInput('wards_check', { plan: [{ command: emoji + 'a' }] }).ok).toBe(false);
  });
  it('names the failing field', () => {
    expect(parseInput('ghost_run', { plan: [{ command: 5 }] })).toMatchObject({ ok: false, field: 'plan.0.command' });
  });
  it('checks id, session, and path inputs', () => {
    expect(parseInput('ghost_diff', { id: 'g-abc_1' }).ok).toBe(true);
    expect(parseInput('ghost_diff', { id: '../x' }).ok).toBe(false);
    expect(parseInput('ghost_trace', { id: 'a', session: 'bad id' }).ok).toBe(false);
    expect(parseInput('ghost_trace', { id: 'a' }).ok).toBe(true);
    expect(parseInput('blacklight', { path: [] }).ok).toBe(false);
    expect(parseInput('blacklight', { path: Array.from({ length: 201 }, () => 'a') }).ok).toBe(false);
    expect(parseInput('blacklight', { path: ['a'] }).ok).toBe(true);
  });
});

describe('result building', () => {
  it('returns content and structuredContent, no isError on success', () => {
    const r = makeResult({ a: 1 });
    expect(r.content[0].type).toBe('text');
    expect(r.structuredContent).toEqual({ a: 1 });
    expect(r.isError).toBeUndefined();
  });
  it('escapes hidden characters and drops secretValues', () => {
    const r = makeResult({ s: 'a\u200Bb', secretValues: ['sk-CANARY-abc123'], n: { payloads: 1, k: 2 } });
    expect(r.structuredContent.s).not.toContain('\u200B');
    expect(JSON.stringify(r)).not.toContain('CANARY');
    expect(r.structuredContent.n).toEqual({ k: 2 });
  });
  it('cuts oversized text at a line boundary with the marker', () => {
    const text = Array.from({ length: 5000 }, (_, i) => `line ${i} ${'x'.repeat(40)}`).join('\n');
    const cut = truncateText(text);
    expect(cut.truncated).toBe(true);
    expect(Buffer.byteLength(cut.text)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(cut.text.endsWith(`\n${TRUNCATED_MARKER}`)).toBe(true);
    for (const line of cut.text.split('\n').slice(0, -1)) expect(line).toMatch(/^line \d+ x{40}$/);
  });
  it('sets structuredContent.truncated for an oversized result', () => {
    const big = { runId: 'r1', items: Array.from({ length: 4000 }, (_, i) => `item-${i}-${'y'.repeat(30)}`) };
    const r = makeResult(big);
    expect(r.structuredContent.truncated).toBe(true);
    expect(r.structuredContent.runId).toBe('r1');
    expect(Buffer.byteLength(r.content[0].text)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(r.content[0].text.endsWith(TRUNCATED_MARKER)).toBe(true);
  });
  it('leaves a small result untouched', () => {
    expect(makeResult({ a: 'b' }).structuredContent.truncated).toBeUndefined();
  });
});

describe('confinePath', () => {
  /** @type {string} */ let base;
  /** @type {string} */ let root;
  beforeAll(async () => {
    base = await mkdtemp(path.join(tmpdir(), 'ghost-mcp-'));
    root = path.join(base, 'ws');
    await mkdir(path.join(root, 'sub'), { recursive: true });
    await writeFile(path.join(root, 'sub', 'a.txt'), 'x');
    await writeFile(path.join(base, 'outside.txt'), 'x');
    await mkdir(path.join(base, 'ws-evil'));
    await symlink(path.join(base, 'outside.txt'), path.join(root, 'link.txt'));
  });
  afterAll(() => rm(base, { recursive: true, force: true }));

  it('accepts the root and paths inside it', async () => {
    expect((await confinePath(root, '.')).ok).toBe(true);
    expect((await confinePath(root, 'sub/a.txt')).ok).toBe(true);
  });
  it('rejects traversal, prefix siblings, and symlink escapes', async () => {
    expect(await confinePath(root, '../outside.txt')).toMatchObject({ ok: false });
    expect(await confinePath(root, '../ws-evil')).toMatchObject({ ok: false });
    expect(await confinePath(root, 'link.txt')).toMatchObject({ ok: false });
  });
  it('rejects missing and malformed paths', async () => {
    expect(await confinePath(root, 'nope')).toMatchObject({ ok: false });
    expect(await confinePath(root, '')).toMatchObject({ ok: false });
    expect(await confinePath(root, 'a\0b')).toMatchObject({ ok: false });
  });
});

describe('diagnostics', () => {
  it('cuts command text to 120 code points', () => {
    expect([...cutCommand('a'.repeat(500))].length).toBeLessThanOrEqual(120);
  });
});

describe('server over an in-memory transport', () => {
  it('lists exactly the five tools with annotations and rejects bad input', async () => {
    const lines = /** @type {string[]} */ ([]);
    const { server } = createServer({ root: tmpdir(), env: {}, stderr: (l) => lines.push(l) });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const n of ['ghost_diff', 'ghost_trace', 'wards_check', 'blacklight']) expect(byName[n].annotations?.readOnlyHint).toBe(true);
    expect(byName.ghost_run.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });

    const bad = await client.callTool({ name: 'ghost_run', arguments: { plan: [{ command: 7 }] } });
    expect(bad.isError).toBe(true);
    expect(JSON.stringify(bad.content)).toContain('command');
    await client.close();
  });
});
